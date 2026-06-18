-- Productos descontinuados: estado propio, distinto de `active` (que también se
-- usa para vinos propuestos por vendedor pendientes de revisión).
-- Un producto está descontinuado cuando discontinued_at IS NOT NULL. Al
-- descontinuar se pone además active=false para sacarlo de catálogo/pedidos.

alter table products
  add column if not exists discontinued_at timestamptz,
  add column if not exists discontinued_by uuid references sales_reps(id);

-- Índice parcial: solo los descontinuados (la mayoría no lo están).
create index if not exists idx_products_discontinued_at
  on products (discontinued_at)
  where discontinued_at is not null;

comment on column products.discontinued_at is
  'Fecha en que el producto se marcó como descontinuado. NULL = vigente.';
comment on column products.discontinued_by is
  'sales_rep que lo descontinuó.';
