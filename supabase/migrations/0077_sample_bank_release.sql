-- =====================================================================
-- Banco de muestras: liberar / devolver botellas (admin)
-- =====================================================================
-- Dos formas de que el admin regrese botellas al banco para que los
-- vendedores las vuelvan a tomar:
--   1) sample_bank_release  — repone N botellas en un bucket (vino, zona,
--      bodega). Es un 'ingreso' manual: sube los disponibles.
--   2) sample_bank_revert_take — revierte una TOMA concreta (desde el
--      historial). Registra una 'devolucion' (+) que la compensa, así las
--      botellas vuelven a estar disponibles y dejan de contar como usadas.
--
-- Append-only (bitácora): nunca borramos la toma; la compensamos. La
-- devolucion apunta a la toma original via `reverts_id`. No recreamos la
-- vista v_sample_bank: `available = sum(quantity)` ya suma las devoluciones.
-- =====================================================================

-- Nuevo tipo de movimiento: 'devolucion' (cantidad positiva).
alter table public.sample_bank_movements drop constraint if exists sample_bank_movements_kind_check;
alter table public.sample_bank_movements
  add constraint sample_bank_movements_kind_check
  check (kind in ('ingreso', 'toma', 'devolucion'));

-- La devolucion referencia la toma que revierte (para netear métricas y
-- evitar devolver dos veces la misma toma).
alter table public.sample_bank_movements
  add column if not exists reverts_id uuid references public.sample_bank_movements(id) on delete set null;
create index if not exists idx_sample_bank_reverts on public.sample_bank_movements(reverts_id);

-- ---------------------------------------------------------------------
-- Liberar/reponer botellas en un bucket (vino, zona, bodega). Admin.
-- ---------------------------------------------------------------------
create or replace function public.sample_bank_release(
  p_product uuid,
  p_region text,
  p_qty numeric,
  p_location text default null,
  p_note text default null
)
returns numeric language plpgsql security definer set search_path = public as $$
declare v_rep uuid; v_avail numeric;
begin
  v_rep := public.current_rep_id();
  if v_rep is null then raise exception 'No autenticado'; end if;
  if not public.is_admin() then raise exception 'Solo admin puede liberar botellas'; end if;
  if p_qty is null or p_qty <= 0 then raise exception 'Cantidad inválida'; end if;
  insert into public.sample_bank_movements(product_id, product_name, supplier, region, location, quantity, kind, notes, created_by)
  select p_product, p.name, p.supplier, p_region, p_location, p_qty, 'ingreso',
         coalesce(nullif(btrim(p_note), ''), 'Liberación manual'), v_rep
  from public.products p where p.id = p_product;
  select coalesce(sum(quantity), 0) into v_avail
  from public.sample_bank_movements
  where product_id = p_product
    and region is not distinct from p_region
    and location is not distinct from p_location;
  return v_avail;
end;
$$;

-- ---------------------------------------------------------------------
-- Revertir una TOMA concreta: registra la devolucion que la compensa. Admin.
-- ---------------------------------------------------------------------
create or replace function public.sample_bank_revert_take(
  p_movement uuid,
  p_note text default null
)
returns numeric language plpgsql security definer set search_path = public as $$
declare m record; v_rep uuid; v_reverted numeric; v_remaining numeric;
begin
  v_rep := public.current_rep_id();
  if v_rep is null then raise exception 'No autenticado'; end if;
  if not public.is_admin() then raise exception 'Solo admin puede devolver tomas'; end if;

  select * into m from public.sample_bank_movements where id = p_movement and kind = 'toma';
  if not found then raise exception 'No se encontró la toma'; end if;

  -- Cuánto se ha devuelto ya de esta toma (devoluciones que la referencian).
  select coalesce(sum(quantity), 0) into v_reverted
  from public.sample_bank_movements
  where reverts_id = p_movement and kind = 'devolucion';

  v_remaining := abs(m.quantity) - v_reverted;   -- m.quantity es negativo
  if v_remaining <= 0 then raise exception 'Esta toma ya fue devuelta'; end if;

  insert into public.sample_bank_movements(
    product_id, product_name, supplier, region, location, quantity, kind,
    account_id, reverts_id, notes, created_by
  )
  values (
    m.product_id, m.product_name, m.supplier, m.region, m.location, v_remaining, 'devolucion',
    m.account_id, p_movement,
    coalesce(nullif(btrim(p_note), ''), 'Devolución de toma'), v_rep
  );
  return v_remaining;
end;
$$;
