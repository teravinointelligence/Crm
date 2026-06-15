-- ---------------------------------------------------------------------
-- Vinos propuestos por vendedores
-- Un vendedor que no encuentra un vino en el catálogo puede proponerlo
-- desde la cuenta. El producto se crea INACTIVO (no entra a cotizaciones)
-- y queda marcado con quién lo propuso para que admin lo revise y active.
-- ---------------------------------------------------------------------

alter table public.products
  add column if not exists proposed_by uuid references public.sales_reps(id),
  add column if not exists proposed_at timestamptz;

-- Un vendedor (no admin) puede INSERTAR un producto solo si:
--   • lo deja inactivo (active = false) → no contamina catálogo ni cotizaciones
--   • se marca a sí mismo como proponente (proposed_by = su rep_id)
-- El UPDATE/DELETE de productos sigue siendo exclusivo de admin
-- (cubierto por la policy products_admin_write existente).
drop policy if exists products_rep_propose on public.products;
create policy products_rep_propose on public.products
  for insert
  with check (
    public.current_rep_id() is not null
    and active = false
    and proposed_by = public.current_rep_id()
  );

-- Índice para que admin liste rápido lo pendiente de revisión.
create index if not exists products_proposed_idx
  on public.products (proposed_by)
  where proposed_by is not null;
