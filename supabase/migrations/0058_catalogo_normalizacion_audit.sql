-- ---------------------------------------------------------------------
-- Bitácora de normalización del catálogo
-- Cada cambio aplicado desde "Normalizar catálogo" (categoría / país /
-- varietal / añada / formato) queda registrado con su valor anterior y
-- nuevo, el origen (regla, IA o manual) y quién lo aplicó. Sirve para
-- auditar y, si hiciera falta, deshacer un cambio masivo.
--
-- No cambia el esquema de `products` (las columnas ya existen); solo añade
-- esta tabla de log y su RLS admin-only.
-- ---------------------------------------------------------------------

create table if not exists public.product_normalization_log (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.products(id) on delete cascade not null,
  field text not null check (field in
    ('category','country','varietal','vintage','volume_ml')),
  old_value text,
  new_value text,
  source text not null default 'rules' check (source in ('rules','llm','manual')),
  confidence text check (confidence in ('alta','media','baja')),
  applied_by uuid references public.sales_reps(id),
  applied_at timestamptz default now()
);

create index if not exists product_normalization_log_product_idx
  on public.product_normalization_log (product_id);
create index if not exists product_normalization_log_applied_at_idx
  on public.product_normalization_log (applied_at desc);

alter table public.product_normalization_log enable row level security;

-- Solo admin lee y escribe la bitácora (la normalización es una acción admin).
drop policy if exists product_normalization_log_admin on public.product_normalization_log;
create policy product_normalization_log_admin on public.product_normalization_log
  for all using (public.is_admin()) with check (public.is_admin());
