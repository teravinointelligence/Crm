-- =====================================================================
-- 0050 — Inventario por almacén
-- =====================================================================
-- Existencias de productos desglosadas por almacén físico:
-- La Paz, V612, Tijuana, Vallarta, Los Cabos.
-- No sustituye products.stock_quantity (stock global CONTPAQi);
-- es un desglose paralelo que se carga por Excel desde Catálogo.
-- =====================================================================

create table if not exists public.product_warehouse_stock (
  product_id uuid not null references public.products(id) on delete cascade,
  warehouse text not null check (
    warehouse in ('La Paz', 'V612', 'Tijuana', 'Vallarta', 'Los Cabos')
  ),
  stock_quantity numeric(10,2) not null default 0,
  last_update timestamptz not null default now(),
  last_source text,
  primary key (product_id, warehouse)
);

create index if not exists idx_pws_warehouse
  on public.product_warehouse_stock (warehouse);

-- RLS: todos leen, solo admin escribe (mismo modelo que products)
alter table public.product_warehouse_stock enable row level security;

drop policy if exists pws_select on public.product_warehouse_stock;
create policy pws_select on public.product_warehouse_stock
  for select using (auth.uid() is not null);

drop policy if exists pws_admin_write on public.product_warehouse_stock;
create policy pws_admin_write on public.product_warehouse_stock
  for all using (public.is_admin()) with check (public.is_admin());

-- Bitácora: nuevo tipo de import
alter table public.inventory_imports
  drop constraint if exists inventory_imports_import_type_check;
alter table public.inventory_imports
  add constraint inventory_imports_import_type_check
  check (import_type in ('catalogo_completo', 'solo_stock', 'inventario_almacen'));
