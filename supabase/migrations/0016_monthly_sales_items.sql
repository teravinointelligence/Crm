-- =====================================================================
-- Detalle por producto de las ventas mensuales (reporte crudo CONTPAQ)
-- =====================================================================
-- Cada fila = un producto vendido a un cliente en un mes. Cuelga de
-- monthly_sales (cliente × periodo). Permite top de vinos por ventas reales.
-- =====================================================================

create table if not exists public.monthly_sales_items (
  id uuid primary key default gen_random_uuid(),
  monthly_sale_id uuid references public.monthly_sales(id) on delete cascade not null,
  codigo text,                          -- SKU CONTPAQ
  producto_nombre text not null,
  cantidad numeric(12,2) default 0,
  neto numeric(14,2) default 0,
  descuento numeric(14,2) default 0,
  neto_desc numeric(14,2) default 0,
  impuesto numeric(14,2) default 0,
  total numeric(14,2) default 0,        -- Total c/IVA+IEPS (venta bruta de la línea)
  created_at timestamptz default now()
);

create index if not exists idx_msi_sale on public.monthly_sales_items(monthly_sale_id);
create index if not exists idx_msi_codigo on public.monthly_sales_items(codigo);

alter table public.monthly_sales_items enable row level security;

-- Lectura: si puede leer la venta padre (admin, su rep, o su cuenta).
drop policy if exists msi_select on public.monthly_sales_items;
create policy msi_select on public.monthly_sales_items
  for select using (
    public.is_admin() or exists (
      select 1 from public.monthly_sales ms
      where ms.id = monthly_sales_items.monthly_sale_id
        and (
          ms.sales_rep_id = public.current_rep_id() or exists (
            select 1 from public.accounts a
            where a.id = ms.account_id and a.assigned_rep_id = public.current_rep_id()
          )
        )
    )
  );

-- Escritura: solo admin.
drop policy if exists msi_admin_write on public.monthly_sales_items;
create policy msi_admin_write on public.monthly_sales_items
  for all using (public.is_admin()) with check (public.is_admin());

-- Vista de top productos por periodo (respeta RLS vía security_invoker).
create or replace view public.v_monthly_product_sales as
select
  ms.period,
  ms.sales_rep_id,
  msi.codigo,
  msi.producto_nombre,
  sum(msi.cantidad) as cantidad,
  sum(msi.total) as total,
  sum(msi.neto_desc) as neto_desc
from public.monthly_sales_items msi
join public.monthly_sales ms on ms.id = msi.monthly_sale_id
group by ms.period, ms.sales_rep_id, msi.codigo, msi.producto_nombre;

alter view public.v_monthly_product_sales set (security_invoker = on);
