-- Transferencias multi-producto: una solicitud (header) con varios renglones.
-- Las columnas single-item del header quedan opcionales (compat con el botón
-- "Transferir" por producto del catálogo).

alter table warehouse_transfer_requests alter column product_label drop not null;
alter table warehouse_transfer_requests alter column quantity drop not null;

create table if not exists warehouse_transfer_items (
  id uuid primary key default gen_random_uuid(),
  transfer_id uuid not null references warehouse_transfer_requests(id) on delete cascade,
  product_id uuid references products(id) on delete set null,
  product_label text not null,
  quantity numeric not null check (quantity > 0),
  created_at timestamptz not null default now()
);

create index if not exists idx_wtransfer_items_transfer on warehouse_transfer_items (transfer_id);

alter table warehouse_transfer_items enable row level security;

drop policy if exists wtransfer_items_select on warehouse_transfer_items;
create policy wtransfer_items_select on warehouse_transfer_items
  for select using (exists (
    select 1 from warehouse_transfer_requests t
    where t.id = transfer_id and (public.is_admin() or t.requested_by = public.current_rep_id())
  ));

drop policy if exists wtransfer_items_insert on warehouse_transfer_items;
create policy wtransfer_items_insert on warehouse_transfer_items
  for insert with check (exists (
    select 1 from warehouse_transfer_requests t
    where t.id = transfer_id and t.requested_by = public.current_rep_id()
  ));

comment on table warehouse_transfer_items is
  'Renglones de una transferencia multi-producto (warehouse_transfer_requests).';
