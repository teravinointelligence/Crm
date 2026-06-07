-- =====================================================================
-- 0036 — ESTADO DE CUENTA POR CLIENTE (Flujo 3)
-- =====================================================================
-- Aterriza la vista de "estado de cuenta" de la plantilla validada dentro
-- de la ficha de cada cliente:
--   1. Config de cartera por cliente (días de pago/revisión, ventana de
--      riesgo configurable, flag legacy).
--   2. Antigüedad CORREGIDA: buckets reales 1-31 / 32-62 / 63-93 / 94+
--      (no 0-30/31-60/61-90/+90) y días vencidos calculados con los días
--      de crédito pactados — regla 11: corte - (fecha_factura + crédito).
--   3. account_aging(corte): función parametrizable por fecha de corte.
--   4. client_balance_snapshots + take_balance_snapshot(): evolución del
--      saldo por corte (Sección 4 de la spec).
--
-- La clasificación de riesgo (Crédito Liberado / Por Revisar / Suspender /
-- Cartera Legacy) se deriva en la app desde estos datos + la config; ver
-- lib/cobranza.ts. El umbral "Por Revisar" es configurable por cliente
-- (default 45 días) para resolver la pregunta abierta 45-vs-32 sin cablearla.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. CONFIG DE CARTERA POR CLIENTE
-- ---------------------------------------------------------------------
-- dias_pago / dias_revision: descriptivos (días en que el cliente paga /
--   revisa facturas), texto libre para no forzar un formato.
-- ventana_revision / ventana_suspension: umbrales numéricos de días
--   vencidos para la clasificación de riesgo (configurables por cliente).
-- is_legacy: cuentas legacy/estratégicas excluidas de métricas operativas.
alter table public.accounts
  add column if not exists dias_pago text,
  add column if not exists dias_revision text,
  add column if not exists ventana_revision int not null default 45,
  add column if not exists ventana_suspension int not null default 62,
  add column if not exists is_legacy boolean not null default false;

alter table public.accounts
  drop constraint if exists accounts_ventana_check;
alter table public.accounts
  add constraint accounts_ventana_check
  check (ventana_revision >= 0 and ventana_suspension >= ventana_revision);

-- Marcar cuentas legacy/estratégicas (Vernazza, Brew Wines, Eno Vino,
-- Ventas Mostrador). Se excluyen de métricas; no entran a suspensión.
update public.accounts
set is_legacy = true
where lower(business_name) like '%vernazza%'
   or lower(business_name) like '%brew wines%'
   or lower(business_name) like '%eno vino%'
   or lower(business_name) like '%ventas mostrador%';

-- ---------------------------------------------------------------------
-- 2. ANTIGÜEDAD POR DÍAS VENCIDOS (con días de crédito) — función
--    parametrizable por fecha de corte.
--    Días vencidos = corte - (invoice_date + credit_days). El primer
--    bucket absorbe lo no vencido / reciente (<=31) para que los buckets
--    SIEMPRE sumen el saldo total (necesario para el % del saldo).
--    security invoker: respeta la RLS de invoices/accounts del que llama.
-- ---------------------------------------------------------------------
drop view if exists public.v_account_aging;

create or replace function public.account_aging(p_corte date default current_date)
returns table (
  account_id uuid,
  b_1_31 numeric,
  b_32_62 numeric,
  b_63_93 numeric,
  b_94_mas numeric,
  saldo_total numeric
)
language sql
stable
security invoker
as $$
  with open_inv as (
    select
      i.account_id,
      i.balance,
      p_corte - (i.invoice_date + coalesce(a.credit_days, 0)) as dias
    from public.invoices i
    join public.accounts a on a.id = i.account_id
    where i.status <> 'cancelada' and i.balance > 0
  )
  select
    a.id as account_id,
    coalesce(sum(case when oi.dias <= 31 then oi.balance else 0 end), 0) as b_1_31,
    coalesce(sum(case when oi.dias between 32 and 62 then oi.balance else 0 end), 0) as b_32_62,
    coalesce(sum(case when oi.dias between 63 and 93 then oi.balance else 0 end), 0) as b_63_93,
    coalesce(sum(case when oi.dias > 93 then oi.balance else 0 end), 0) as b_94_mas,
    coalesce(sum(oi.balance), 0) as saldo_total
  from public.accounts a
  left join open_inv oi on oi.account_id = a.id
  group by a.id;
$$;

-- Vista de conveniencia: antigüedad al corte de hoy (consumo en la ficha/PDF).
-- Expone los buckets NUEVOS (b_1_31…) y MANTIENE los viejos (bucket_0_30…,
-- due_date-based) para que el código aún desplegado no rompa si la migración
-- se aplica antes del deploy. Los viejos se pueden retirar tras el rollout.
create view public.v_account_aging
with (security_invoker = on) as
  with old_ag as (
    select
      i.account_id,
      coalesce(sum(case when (current_date - coalesce(i.due_date, i.invoice_date)) <= 30 then i.balance else 0 end), 0) as bucket_0_30,
      coalesce(sum(case when (current_date - coalesce(i.due_date, i.invoice_date)) between 31 and 60 then i.balance else 0 end), 0) as bucket_31_60,
      coalesce(sum(case when (current_date - coalesce(i.due_date, i.invoice_date)) between 61 and 90 then i.balance else 0 end), 0) as bucket_61_90,
      coalesce(sum(case when (current_date - coalesce(i.due_date, i.invoice_date)) > 90 then i.balance else 0 end), 0) as bucket_90_plus
    from public.invoices i
    where i.status <> 'cancelada' and i.balance > 0
    group by i.account_id
  )
  select
    aa.account_id,
    a.business_name,
    aa.b_1_31,
    aa.b_32_62,
    aa.b_63_93,
    aa.b_94_mas,
    aa.saldo_total,
    coalesce(o.bucket_0_30, 0) as bucket_0_30,
    coalesce(o.bucket_31_60, 0) as bucket_31_60,
    coalesce(o.bucket_61_90, 0) as bucket_61_90,
    coalesce(o.bucket_90_plus, 0) as bucket_90_plus
  from public.account_aging(current_date) aa
  join public.accounts a on a.id = aa.account_id
  left join old_ag o on o.account_id = aa.account_id;

-- ---------------------------------------------------------------------
-- 3. SNAPSHOTS DE SALDO POR CORTE (Sección 4 — evolución del saldo)
-- ---------------------------------------------------------------------
create table if not exists public.client_balance_snapshots (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  fecha_corte date not null,
  saldo_total numeric not null default 0,
  b_1_31 numeric not null default 0,
  b_32_62 numeric not null default 0,
  b_63_93 numeric not null default 0,
  b_94_mas numeric not null default 0,
  created_at timestamptz not null default now(),
  unique (account_id, fecha_corte)
);

create index if not exists idx_balance_snapshots_account
  on public.client_balance_snapshots (account_id, fecha_corte desc);

-- RPC: toma (o re-toma) el snapshot de TODOS los clientes con saldo a una
-- fecha de corte. Idempotente por (cliente, corte). Solo admin/contador.
create or replace function public.take_balance_snapshot(p_corte date default current_date)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  if not public.can_reconcile() then
    raise exception 'Solo admin o contador pueden tomar snapshots de cartera';
  end if;

  insert into public.client_balance_snapshots
    (account_id, fecha_corte, saldo_total, b_1_31, b_32_62, b_63_93, b_94_mas)
  select aa.account_id, p_corte, aa.saldo_total, aa.b_1_31, aa.b_32_62, aa.b_63_93, aa.b_94_mas
  from public.account_aging(p_corte) aa
  where aa.saldo_total > 0
  on conflict (account_id, fecha_corte) do update
    set saldo_total = excluded.saldo_total,
        b_1_31      = excluded.b_1_31,
        b_32_62     = excluded.b_32_62,
        b_63_93     = excluded.b_63_93,
        b_94_mas    = excluded.b_94_mas,
        created_at  = now();

  get diagnostics n = row_count;
  return n;
end;
$$;

-- ---------------------------------------------------------------------
-- 4. RLS — snapshots: leen admin/contador o el vendedor de la cuenta;
--    escritura solo vía el RPC (security definer) o admin/contador.
-- ---------------------------------------------------------------------
alter table public.client_balance_snapshots enable row level security;

drop policy if exists balance_snapshots_read on public.client_balance_snapshots;
create policy balance_snapshots_read on public.client_balance_snapshots
  for select using (
    public.can_read_all() or exists (
      select 1 from public.accounts a
      where a.id = client_balance_snapshots.account_id
        and a.assigned_rep_id = public.current_rep_id()
    )
  );

drop policy if exists balance_snapshots_write on public.client_balance_snapshots;
create policy balance_snapshots_write on public.client_balance_snapshots
  for all using (public.can_reconcile()) with check (public.can_reconcile());
