-- Política escalonada de crédito por reincidencia en pagos tardíos.
--
-- La reducción ocurre al registrar un pago positivo y confirmado mientras la
-- cuenta tiene una factura vencida. Cada atraso reduce un solo peldaño:
-- 60 -> 45 -> 30 -> 15 -> contado. Un segundo abono al mismo atraso no vuelve
-- a reducir el plazo; para bajar otro peldaño debe vencer una factura cuya
-- fecha de vencimiento sea posterior al ajuste anterior.

create table if not exists public.account_credit_adjustments (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete restrict,
  payment_id uuid unique references public.payments(id) on delete set null,
  triggering_invoice_id uuid references public.invoices(id) on delete set null,
  payment_date date not null,
  previous_credit_days int not null,
  new_credit_days int not null,
  reason text not null default 'pago_con_factura_vencida',
  created_at timestamptz not null default now(),
  constraint account_credit_adjustments_previous_range
    check (previous_credit_days between 0 and 365),
  constraint account_credit_adjustments_new_range
    check (new_credit_days between 0 and 365),
  constraint account_credit_adjustments_reduces_term
    check (new_credit_days < previous_credit_days)
);

create index if not exists idx_account_credit_adjustments_account_date
  on public.account_credit_adjustments(account_id, payment_date desc, created_at desc);

alter table public.account_credit_adjustments enable row level security;

drop policy if exists account_credit_adjustments_read
  on public.account_credit_adjustments;
create policy account_credit_adjustments_read
  on public.account_credit_adjustments
  for select
  to authenticated
  using (
    public.can_read_all()
    or public.is_jefe_logistica()
    or exists (
      select 1
      from public.accounts a
      where a.id = account_credit_adjustments.account_id
        and a.assigned_rep_id = public.current_rep_id()
    )
  );

revoke all on public.account_credit_adjustments from anon, authenticated;
grant select on public.account_credit_adjustments to authenticated, service_role;

comment on table public.account_credit_adjustments is
  'Bitácora inmutable de reducciones automáticas del plazo de crédito por reincidencia en pagos tardíos.';

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function private.next_credit_days(current_days int)
returns int
language sql
immutable
strict
set search_path = ''
as $$
  select case
    when current_days > 60 then 60
    when current_days > 45 then 45
    when current_days > 30 then 30
    when current_days > 15 then 15
    when current_days > 0 then 0
    else 0
  end;
$$;

create or replace function private.adjust_credit_after_late_payment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current_credit_days int;
  v_new_credit_days int;
  v_last_adjustment_date date;
  v_triggering_invoice_id uuid;
begin
  if new.amount <= 0 or not coalesce(new.confirmado, true) then
    return new;
  end if;

  -- El bloqueo de fila serializa pagos concurrentes de la misma cuenta.
  select a.credit_days
    into v_current_credit_days
  from public.accounts a
  where a.id = new.account_id
    and not coalesce(a.es_socio, false)
  for update;

  if not found or v_current_credit_days is null or v_current_credit_days <= 0 then
    return new;
  end if;

  select max(aca.payment_date)
    into v_last_adjustment_date
  from public.account_credit_adjustments aca
  where aca.account_id = new.account_id;

  -- Usa el plazo vigente de la cuenta para no depender de vencimientos
  -- importados. La segunda condición evita reducir dos veces por el mismo
  -- episodio de atraso aunque existan pagos parciales posteriores.
  select i.id
    into v_triggering_invoice_id
  from public.invoices i
  where i.account_id = new.account_id
    and i.status <> 'cancelada'
    and coalesce(i.balance, 0) > 0
    and (i.invoice_date + v_current_credit_days) < new.payment_date
    and (
      v_last_adjustment_date is null
      or (i.invoice_date + v_current_credit_days) > v_last_adjustment_date
    )
  order by (i.invoice_date + v_current_credit_days), i.invoice_date, i.id
  limit 1;

  if v_triggering_invoice_id is null then
    return new;
  end if;

  v_new_credit_days := private.next_credit_days(v_current_credit_days);
  if v_new_credit_days >= v_current_credit_days then
    return new;
  end if;

  update public.accounts
  set credit_days = v_new_credit_days
  where id = new.account_id;

  insert into public.account_credit_adjustments (
    account_id,
    payment_id,
    triggering_invoice_id,
    payment_date,
    previous_credit_days,
    new_credit_days
  ) values (
    new.account_id,
    new.id,
    v_triggering_invoice_id,
    new.payment_date,
    v_current_credit_days,
    v_new_credit_days
  );

  return new;
end;
$$;

revoke all on function private.next_credit_days(int) from public, anon, authenticated;
revoke all on function private.adjust_credit_after_late_payment() from public, anon, authenticated;

drop trigger if exists trg_adjust_credit_after_late_payment on public.payments;
create trigger trg_adjust_credit_after_late_payment
  after insert on public.payments
  for each row
  execute function private.adjust_credit_after_late_payment();

comment on function private.adjust_credit_after_late_payment() is
  'Reduce un peldaño el crédito cuando un pago nuevo coincide con una nueva factura vencida; SECURITY DEFINER permite que todos los flujos autorizados de pago apliquen la política central.';
