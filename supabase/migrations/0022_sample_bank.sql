-- Banco de muestras: stock de botellas de muestra por zona + ubicación física (bodega).
-- Cada solicitud aprobada genera movimientos 'ingreso'; "Tomar" genera 'salida'.
-- (La tabla se creó originalmente en producción; esta migración la deja versionada
--  e idempotente, y agrega las columnas `location` y `account_id`.)
create table if not exists public.sample_bank_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete restrict,
  product_name text not null,
  supplier text,                       -- bodega / proveedor del vino (winery)
  region text,                         -- zona de ventas (heredada de la cuenta)
  location text,                       -- bodega física donde se resguarda la muestra
  quantity numeric(10,2) not null,
  kind text not null check (kind in ('ingreso','salida')),
  source_request_id uuid references public.sample_requests(id) on delete set null,
  account_id uuid references public.accounts(id) on delete set null,  -- cuenta destino al tomar
  taken_by uuid references public.sales_reps(id) on delete set null,
  notes text,
  created_by uuid references public.sales_reps(id) on delete set null,
  created_at timestamptz default now()
);

-- columnas nuevas (por si la tabla ya existía en producción sin ellas)
alter table public.sample_bank_movements add column if not exists location text;
alter table public.sample_bank_movements
  add column if not exists account_id uuid references public.accounts(id) on delete set null;

create index if not exists idx_sample_bank_region on public.sample_bank_movements(region);
create index if not exists idx_sample_bank_location on public.sample_bank_movements(location);
create index if not exists idx_sample_bank_product on public.sample_bank_movements(product_id);
create index if not exists idx_sample_bank_account on public.sample_bank_movements(account_id);

alter table public.sample_bank_movements enable row level security;

-- Lectura: admin/lectura global ve todo; vendedor sólo su zona.
drop policy if exists sample_bank_select on public.sample_bank_movements;
create policy sample_bank_select on public.sample_bank_movements
  for select using (
    public.can_read_all()
    or region is not distinct from (
      select primary_region from public.sales_reps where id = public.current_rep_id()
    )
  );

-- Escritura: sólo admin (aprobar ingresos y tomar muestras).
drop policy if exists sample_bank_admin_write on public.sample_bank_movements;
create policy sample_bank_admin_write on public.sample_bank_movements
  for all using (public.is_admin()) with check (public.is_admin());
