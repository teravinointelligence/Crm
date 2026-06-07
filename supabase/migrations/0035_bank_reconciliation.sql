-- =====================================================================
-- CONCILIACIÓN BANCARIA — estados de cuenta, transacciones y aplicación
-- =====================================================================
-- Mete el flujo de conciliación dentro del CRM:
--   1. bank_statements     → el archivo del banco subido (PDF/CSV/XLSX en Storage).
--   2. bank_transactions   → cada movimiento parseado (abono/cargo) del estado.
--   3. payment_allocations → desglose de un pago sobre 1..N facturas (pagos
--                            parciales o un depósito que cubre varias facturas).
--   + columnas en payments para ligar el pago a su transacción bancaria.
--   + refactor de apply_payment para que SIEMPRE registre allocations.
--   + RPC reconcile_transaction: aplica un abono conciliado (humano confirma).
--   + vista v_account_aging: antigüedad de saldos 0-30/31-60/61-90/+90.
--
-- Quién concilia (subir + confirmar): admin o contador activo  →  can_reconcile().
-- El resto (vendedores) sólo ve; el contador ya tenía lectura global.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Predicado: quién puede conciliar (escritura sobre el módulo de banco).
-- ---------------------------------------------------------------------
create or replace function public.can_reconcile()
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (
    select 1 from public.sales_reps
    where auth_user_id = auth.uid() and role = 'contador' and active = true
  );
$$;

-- ---------------------------------------------------------------------
-- 1. ESTADOS DE CUENTA BANCARIOS
-- ---------------------------------------------------------------------
create table if not exists public.bank_statements (
  id uuid primary key default gen_random_uuid(),
  bank text,                              -- BBVA, Santander, etc. (libre)
  account_label text,                     -- nombre/alias de la cuenta bancaria
  account_number text,                    -- últimos dígitos / clabe parcial
  period_start date,
  period_end date,
  -- Archivo original en el bucket privado 'estados-cuenta': <statement_id>/<archivo>.
  file_path text,
  file_name text,
  file_kind text check (file_kind in ('pdf','csv','xlsx')),
  status text not null default 'procesado'
    check (status in ('pendiente','procesado')),
  uploaded_by uuid references public.sales_reps(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_bank_statements_period
  on public.bank_statements(period_end desc);

drop trigger if exists set_updated_at on public.bank_statements;
create trigger set_updated_at before update on public.bank_statements
  for each row execute function public.tg_set_updated_at();

-- ---------------------------------------------------------------------
-- 2. TRANSACCIONES DEL ESTADO DE CUENTA
-- ---------------------------------------------------------------------
create table if not exists public.bank_transactions (
  id uuid primary key default gen_random_uuid(),
  bank_statement_id uuid references public.bank_statements(id) on delete cascade not null,
  txn_date date,
  description text,                       -- concepto / descripción del banco
  reference text,                         -- referencia / folio del movimiento
  amount numeric(14,2) not null,          -- monto SIEMPRE positivo; el signo va en `kind`
  kind text not null check (kind in ('abono','cargo')),
  estado_conciliacion text not null default 'sin_conciliar'
    check (estado_conciliacion in ('sin_conciliar','sugerido','conciliado','ignorado')),
  -- Cuenta candidata/elegida (se llena al sugerir o conciliar).
  matched_account_id uuid references public.accounts(id) on delete set null,
  -- Sugerencia generada (heurística o Claude): { source, confidence, reason,
  --   account_id, candidates:[{invoice_id, invoice_number, amount}] }.
  suggestion jsonb,
  -- Orden de aparición en el archivo (para preservar el orden del estado).
  row_index int,
  created_at timestamptz default now()
);

create index if not exists idx_bank_txn_statement
  on public.bank_transactions(bank_statement_id, row_index);
create index if not exists idx_bank_txn_estado
  on public.bank_transactions(estado_conciliacion);

-- ---------------------------------------------------------------------
-- 3. DESGLOSE DE PAGOS SOBRE FACTURAS (allocations)
-- ---------------------------------------------------------------------
create table if not exists public.payment_allocations (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid references public.payments(id) on delete cascade not null,
  invoice_id uuid references public.invoices(id) on delete cascade not null,
  amount_applied numeric(14,2) not null check (amount_applied > 0),
  created_at timestamptz default now()
);

create index if not exists idx_pay_alloc_payment on public.payment_allocations(payment_id);
create index if not exists idx_pay_alloc_invoice on public.payment_allocations(invoice_id);

-- Columnas nuevas en payments para la trazabilidad de la conciliación.
alter table public.payments
  add column if not exists bank_transaction_id uuid
    references public.bank_transactions(id) on delete set null,
  add column if not exists created_by uuid
    references public.sales_reps(id) on delete set null,
  add column if not exists confirmado boolean not null default true;

create index if not exists idx_payments_bank_txn
  on public.payments(bank_transaction_id);

-- ---------------------------------------------------------------------
-- 4. apply_payment — ahora registra allocations + autoría (compatible).
--    Misma firma que 0006: la UI y los imports existentes siguen igual.
-- ---------------------------------------------------------------------
create or replace function public.apply_payment(
  p_account_id uuid, p_amount numeric, p_payment_date date, p_method text,
  p_reference text, p_notes text, p_invoice_id uuid default null
) returns uuid language plpgsql set search_path = public as $$
declare v_payment_id uuid; v_remaining numeric := p_amount; v_inv record; v_apply numeric;
begin
  insert into public.payments
    (invoice_id, account_id, payment_date, amount, method, reference, notes, created_by)
    values (p_invoice_id, p_account_id, p_payment_date, p_amount, p_method, p_reference, p_notes,
            public.current_rep_id())
    returning id into v_payment_id;

  if p_invoice_id is not null then
    update public.invoices set total_paid = coalesce(total_paid,0) + p_amount where id = p_invoice_id;
    insert into public.payment_allocations (payment_id, invoice_id, amount_applied)
      values (v_payment_id, p_invoice_id, p_amount);
    perform public.refresh_invoice_status(p_invoice_id);
  else
    for v_inv in
      select id, balance from public.invoices
      where account_id = p_account_id and status <> 'cancelada' and balance > 0
      order by due_date nulls last, invoice_date
    loop
      exit when v_remaining <= 0;
      v_apply := least(v_remaining, v_inv.balance);
      update public.invoices set total_paid = coalesce(total_paid,0) + v_apply where id = v_inv.id;
      insert into public.payment_allocations (payment_id, invoice_id, amount_applied)
        values (v_payment_id, v_inv.id, v_apply);
      perform public.refresh_invoice_status(v_inv.id);
      v_remaining := v_remaining - v_apply;
    end loop;
  end if;
  return v_payment_id;
end;
$$;

-- ---------------------------------------------------------------------
-- 5. reconcile_transaction — aplica un abono YA confirmado por un humano.
--    Crea el pago (ligado a la transacción), reparte sobre las facturas
--    indicadas (allocations explícitas) y marca la transacción conciliada.
--    p_allocations: jsonb array [{ "invoice_id": uuid, "amount": numeric }, ...]
-- ---------------------------------------------------------------------
create or replace function public.reconcile_transaction(
  p_transaction_id uuid,
  p_account_id uuid,
  p_allocations jsonb,
  p_method text default 'transferencia',
  p_reference text default null,
  p_notes text default null
) returns uuid language plpgsql set search_path = public as $$
declare
  v_txn public.bank_transactions%rowtype;
  v_payment_id uuid;
  v_total numeric := 0;
  v_alloc jsonb;
  v_invoice_id uuid;
  v_amount numeric;
begin
  select * into v_txn from public.bank_transactions where id = p_transaction_id;
  if not found then raise exception 'Transacción no encontrada'; end if;
  if v_txn.kind <> 'abono' then raise exception 'Solo se concilian abonos'; end if;
  if v_txn.estado_conciliacion = 'conciliado' then
    raise exception 'La transacción ya está conciliada';
  end if;

  -- Suma de las aplicaciones (debe cuadrar con el abono; no recalcula impuestos).
  for v_alloc in select * from jsonb_array_elements(coalesce(p_allocations, '[]'::jsonb)) loop
    v_total := v_total + (v_alloc->>'amount')::numeric;
  end loop;
  if v_total <= 0 then raise exception 'Las aplicaciones suman 0'; end if;
  if v_total > v_txn.amount + 0.01 then
    raise exception 'Las aplicaciones (%) exceden el abono (%)', round(v_total, 2), round(v_txn.amount, 2);
  end if;

  insert into public.payments
    (account_id, payment_date, amount, method, reference, notes,
     bank_transaction_id, created_by, confirmado)
    values (p_account_id, coalesce(v_txn.txn_date, current_date), v_total, p_method,
            coalesce(p_reference, v_txn.reference), p_notes,
            p_transaction_id, public.current_rep_id(), true)
    returning id into v_payment_id;

  for v_alloc in select * from jsonb_array_elements(p_allocations) loop
    v_invoice_id := (v_alloc->>'invoice_id')::uuid;
    v_amount := (v_alloc->>'amount')::numeric;
    if v_amount is null or v_amount <= 0 then continue; end if;
    update public.invoices set total_paid = coalesce(total_paid,0) + v_amount
      where id = v_invoice_id;
    insert into public.payment_allocations (payment_id, invoice_id, amount_applied)
      values (v_payment_id, v_invoice_id, v_amount);
    perform public.refresh_invoice_status(v_invoice_id);
  end loop;

  update public.bank_transactions
    set estado_conciliacion = 'conciliado', matched_account_id = p_account_id
    where id = p_transaction_id;

  return v_payment_id;
end;
$$;

-- ---------------------------------------------------------------------
-- 6. ANTIGÜEDAD DE SALDOS — buckets 0-30 / 31-60 / 61-90 / +90 días.
--    Por días vencidos respecto a due_date (fallback invoice_date).
--    security_invoker para respetar RLS de invoices/accounts.
-- ---------------------------------------------------------------------
create or replace view public.v_account_aging as
with open_inv as (
  select
    i.account_id,
    i.balance,
    current_date - coalesce(i.due_date, i.invoice_date) as dias
  from public.invoices i
  where i.status <> 'cancelada' and i.balance > 0
)
select
  a.id as account_id,
  a.business_name,
  coalesce(sum(case when oi.dias <= 30 then oi.balance else 0 end), 0) as bucket_0_30,
  coalesce(sum(case when oi.dias between 31 and 60 then oi.balance else 0 end), 0) as bucket_31_60,
  coalesce(sum(case when oi.dias between 61 and 90 then oi.balance else 0 end), 0) as bucket_61_90,
  coalesce(sum(case when oi.dias > 90 then oi.balance else 0 end), 0) as bucket_90_plus,
  coalesce(sum(oi.balance), 0) as saldo_total
from public.accounts a
left join open_inv oi on oi.account_id = a.id
group by a.id, a.business_name;

alter view public.v_account_aging set (security_invoker = on);

-- ---------------------------------------------------------------------
-- 7. RLS
-- ---------------------------------------------------------------------
alter table public.bank_statements enable row level security;
alter table public.bank_transactions enable row level security;
alter table public.payment_allocations enable row level security;

-- Banco: leen admin/contador (can_read_all); escriben admin/contador (can_reconcile).
drop policy if exists bank_statements_read on public.bank_statements;
create policy bank_statements_read on public.bank_statements
  for select using (public.can_read_all());
drop policy if exists bank_statements_write on public.bank_statements;
create policy bank_statements_write on public.bank_statements
  for all using (public.can_reconcile()) with check (public.can_reconcile());

drop policy if exists bank_transactions_read on public.bank_transactions;
create policy bank_transactions_read on public.bank_transactions
  for select using (public.can_read_all());
drop policy if exists bank_transactions_write on public.bank_transactions;
create policy bank_transactions_write on public.bank_transactions
  for all using (public.can_reconcile()) with check (public.can_reconcile());

-- Allocations: visibles para quien ve la cuenta del pago; escritura por las
-- mismas reglas que payments (admin o vendedor de la cuenta) — los RPC corren
-- como el usuario, así que la RLS de payments/invoices ya los cubre.
drop policy if exists payment_allocations_read on public.payment_allocations;
create policy payment_allocations_read on public.payment_allocations
  for select using (
    public.can_read_all() or exists (
      select 1 from public.payments p
      join public.accounts a on a.id = p.account_id
      where p.id = payment_allocations.payment_id
        and a.assigned_rep_id = public.current_rep_id()
    )
  );
drop policy if exists payment_allocations_write on public.payment_allocations;
create policy payment_allocations_write on public.payment_allocations
  for all using (
    public.is_admin() or public.can_reconcile() or exists (
      select 1 from public.payments p
      join public.accounts a on a.id = p.account_id
      where p.id = payment_allocations.payment_id
        and a.assigned_rep_id = public.current_rep_id()
    )
  ) with check (
    public.is_admin() or public.can_reconcile() or exists (
      select 1 from public.payments p
      join public.accounts a on a.id = p.account_id
      where p.id = payment_allocations.payment_id
        and a.assigned_rep_id = public.current_rep_id()
    )
  );

-- ---------------------------------------------------------------------
-- 8. STORAGE — bucket privado para los archivos del banco.
--    Ruta: <statement_id>/<archivo>. Lectura: can_read_all; escritura: can_reconcile.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
  values ('estados-cuenta', 'estados-cuenta', false)
  on conflict (id) do nothing;

drop policy if exists estados_cuenta_select on storage.objects;
create policy estados_cuenta_select on storage.objects for select using (
  bucket_id = 'estados-cuenta' and public.can_read_all()
);
drop policy if exists estados_cuenta_insert on storage.objects;
create policy estados_cuenta_insert on storage.objects for insert with check (
  bucket_id = 'estados-cuenta' and public.can_reconcile()
);
drop policy if exists estados_cuenta_update on storage.objects;
create policy estados_cuenta_update on storage.objects for update using (
  bucket_id = 'estados-cuenta' and public.can_reconcile()
) with check (
  bucket_id = 'estados-cuenta' and public.can_reconcile()
);
drop policy if exists estados_cuenta_delete on storage.objects;
create policy estados_cuenta_delete on storage.objects for delete using (
  bucket_id = 'estados-cuenta' and public.can_reconcile()
);
