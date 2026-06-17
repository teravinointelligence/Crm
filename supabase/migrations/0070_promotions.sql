create table if not exists public.promotions (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  product_id   uuid references public.products(id) on delete set null,
  promo_type   text not null check (promo_type in ('descuento', 'bonificacion', 'paquete', 'temporada', 'otro')),
  description  text,
  discount_pct numeric(5,2),   -- porcentaje de descuento (opcional)
  bonus_qty    integer,         -- unidades bonificadas (ej. "lleva X")
  bonus_per    integer,         -- por cada Y unidades compradas
  valid_from   date,
  valid_to     date,
  active       boolean not null default true,
  created_by   uuid references public.sales_reps(id),
  created_at   timestamptz not null default now()
);

alter table public.promotions enable row level security;

-- Todos los usuarios del CRM pueden ver las promociones.
create policy "promotions_select" on public.promotions
  for select using (
    exists (select 1 from public.sales_reps where auth_user_id = auth.uid())
  );

-- Solo admin puede crear, editar y eliminar.
create policy "promotions_insert" on public.promotions
  for insert with check (
    exists (select 1 from public.sales_reps where auth_user_id = auth.uid() and role = 'admin')
  );

create policy "promotions_update" on public.promotions
  for update using (
    exists (select 1 from public.sales_reps where auth_user_id = auth.uid() and role = 'admin')
  );

create policy "promotions_delete" on public.promotions
  for delete using (
    exists (select 1 from public.sales_reps where auth_user_id = auth.uid() and role = 'admin')
  );
