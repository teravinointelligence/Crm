-- Solicitudes de transferencia de producto entre almacenes. Un vendedor que
-- necesita un vino en su plaza (p.ej. La Paz) y lo hay en otra (Los Cabos) crea
-- una solicitud; debe ser APROBADA por admin antes de moverse físicamente.
-- No ajusta inventario automáticamente: es un flujo de aprobación.

create table if not exists warehouse_transfer_requests (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references products(id) on delete cascade,
  product_label text not null,              -- snapshot del nombre del producto
  from_warehouse text not null,
  to_warehouse text not null,
  quantity numeric not null check (quantity > 0),
  reason text,                              -- motivo / cliente / pedido
  status text not null default 'pendiente', -- pendiente | aprobada | rechazada | completada
  admin_notes text,
  requested_by uuid references sales_reps(id),
  decided_by uuid references sales_reps(id),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (from_warehouse <> to_warehouse)
);

create index if not exists idx_wtransfers_status on warehouse_transfer_requests (status, created_at desc);
create index if not exists idx_wtransfers_requested_by on warehouse_transfer_requests (requested_by);

alter table warehouse_transfer_requests enable row level security;

-- Lectura: admin todo; el vendedor ve las que él solicitó.
drop policy if exists wtransfers_select on warehouse_transfer_requests;
create policy wtransfers_select on warehouse_transfer_requests
  for select using (
    public.is_admin() or requested_by = public.current_rep_id()
  );

-- Alta: el solicitante como sí mismo.
drop policy if exists wtransfers_insert on warehouse_transfer_requests;
create policy wtransfers_insert on warehouse_transfer_requests
  for insert with check (requested_by = public.current_rep_id());

-- Decisión (aprobar/rechazar/completar): solo admin.
drop policy if exists wtransfers_update on warehouse_transfer_requests;
create policy wtransfers_update on warehouse_transfer_requests
  for update using (public.is_admin()) with check (public.is_admin());

comment on table warehouse_transfer_requests is
  'Solicitudes de transferencia de producto entre almacenes (aprueba admin).';
