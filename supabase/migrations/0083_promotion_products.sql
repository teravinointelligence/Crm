-- =====================================================================
-- 0083: Productos participantes por promoción (promotion_products)
-- =====================================================================
-- Permite etiquetar qué productos del catálogo participan en una promoción
-- multi-marca (p. ej. "Jackson Family Wines — Copeo 10+1" cubre varios SKUs).
--
-- Uso: en el diálogo "Enviar a clientes" de una promo se ofrece el filtro
-- "Compradores de la promo", que marca a las cuentas que ya compraron alguno
-- de estos productos (cruce contra reporte de ventas monthly_sales_items por
-- products.sku o products.codigo_contpaqi). Es opcional: una promo sin
-- productos etiquetados simplemente no muestra ese filtro.
--
-- RLS: espeja promotions — cualquier vendedor puede leer; solo admin escribe.
-- =====================================================================

create table if not exists public.promotion_products (
  promotion_id uuid not null references public.promotions(id) on delete cascade,
  product_id   uuid not null references public.products(id)   on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (promotion_id, product_id)
);

create index if not exists idx_promotion_products_product
  on public.promotion_products(product_id);

alter table public.promotion_products enable row level security;

-- Lectura: cualquier sales_rep autenticado (igual que promotions_select).
create policy promotion_products_select on public.promotion_products
  for select using (
    exists (select 1 from public.sales_reps where sales_reps.auth_user_id = auth.uid())
  );

-- Alta: solo admin.
create policy promotion_products_insert on public.promotion_products
  for insert with check (
    exists (
      select 1 from public.sales_reps
      where sales_reps.auth_user_id = auth.uid() and sales_reps.role = 'admin'
    )
  );

-- Baja: solo admin.
create policy promotion_products_delete on public.promotion_products
  for delete using (
    exists (
      select 1 from public.sales_reps
      where sales_reps.auth_user_id = auth.uid() and sales_reps.role = 'admin'
    )
  );
