-- =====================================================================
-- Ventas mensuales por cliente (import desde Excel CONTPAQ por vendedor)
-- =====================================================================
-- Cada fila = ventas de un cliente en un mes. El vendedor se deriva del
-- assigned_rep_id de la cuenta (distribución automática). Se guarda también
-- el nombre del vendedor que traía el Excel para detectar discrepancias.
-- =====================================================================

create table if not exists public.monthly_sales (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references public.accounts(id) on delete cascade not null,
  sales_rep_id uuid references public.sales_reps(id) on delete set null,
  period date not null,                 -- primer día del mes (ej. 2026-04-01)
  client_number text,                   -- # cliente CONTPAQ (referencia)
  client_name text,                     -- nombre comercial del Excel
  vendedor_excel text,                  -- vendedor según el Excel (cross-check)
  venta_bruta numeric(14,2) default 0,  -- Total c/IVA+IEPS
  neto numeric(14,2) default 0,
  descuento numeric(14,2) default 0,
  neto_desc numeric(14,2) default 0,    -- base de comisión
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (account_id, period)
);

create index if not exists idx_monthly_sales_period on public.monthly_sales(period);
create index if not exists idx_monthly_sales_rep_period
  on public.monthly_sales(sales_rep_id, period);
create index if not exists idx_monthly_sales_account on public.monthly_sales(account_id);

alter table public.monthly_sales enable row level security;

-- Lectura: admin todo; rep solo sus ventas (las de sus cuentas asignadas).
drop policy if exists monthly_sales_select on public.monthly_sales;
create policy monthly_sales_select on public.monthly_sales
  for select using (
    public.is_admin() or sales_rep_id = public.current_rep_id() or exists (
      select 1 from public.accounts a
      where a.id = monthly_sales.account_id
        and a.assigned_rep_id = public.current_rep_id()
    )
  );

-- Escritura: solo admin (la carga la hace Sabrina / dirección).
drop policy if exists monthly_sales_admin_write on public.monthly_sales;
create policy monthly_sales_admin_write on public.monthly_sales
  for all using (public.is_admin()) with check (public.is_admin());

-- Vista de resumen por vendedor y periodo.
create or replace view public.v_monthly_sales_by_rep as
select
  ms.period,
  ms.sales_rep_id,
  count(*) as clientes,
  coalesce(sum(ms.venta_bruta), 0) as venta_bruta,
  coalesce(sum(ms.neto), 0) as neto,
  coalesce(sum(ms.descuento), 0) as descuento,
  coalesce(sum(ms.neto_desc), 0) as neto_desc
from public.monthly_sales ms
group by ms.period, ms.sales_rep_id;

-- security_invoker para que la vista respete la RLS de monthly_sales.
alter view public.v_monthly_sales_by_rep set (security_invoker = on);
