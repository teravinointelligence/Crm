-- =====================================================================
-- Banco de muestras: "liberar" saca la botella del banco (admin)
-- =====================================================================
-- Una liberacion representa una botella que deja de estar disponible en el
-- banco (por ejemplo, porque el cliente se la queda). No es una "toma" de un
-- vendedor y, por tanto, no debe incrementar la metrica de muestras usadas.
-- =====================================================================

alter table public.sample_bank_movements
  drop constraint if exists sample_bank_movements_kind_check;

alter table public.sample_bank_movements
  add constraint sample_bank_movements_kind_check
  -- `terminado` ya existe en produccion para consumos completados.
  check (kind in ('ingreso', 'toma', 'devolucion', 'terminado', 'liberacion'));

create or replace function public.sample_bank_release(
  p_product uuid,
  p_region text,
  p_qty numeric,
  p_location text default null,
  p_note text default null
)
returns numeric
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_rep uuid;
  v_avail numeric;
  v_product_name text;
  v_supplier text;
begin
  v_rep := public.current_rep_id();
  if v_rep is null then raise exception 'No autenticado'; end if;
  if not public.is_admin() then raise exception 'Solo admin puede liberar botellas'; end if;
  if p_qty is null or p_qty <= 0 then raise exception 'Cantidad invalida'; end if;

  -- Serializa liberaciones simultaneas del mismo bucket antes de sumar.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_product::text || '|' || coalesce(p_region, '') || '|' || coalesce(p_location, ''),
      0
    )
  );

  select coalesce(sum(quantity), 0)
    into v_avail
  from public.sample_bank_movements
  where product_id = p_product
    and region is not distinct from p_region
    and location is not distinct from p_location;

  if v_avail < p_qty then
    raise exception 'No hay suficientes botellas en el banco (disponibles: %)', v_avail
      using errcode = 'check_violation';
  end if;

  select name, supplier
    into v_product_name, v_supplier
  from public.products
  where id = p_product;

  if not found then raise exception 'Producto no encontrado'; end if;

  insert into public.sample_bank_movements(
    product_id, product_name, supplier, region, location, quantity, kind, notes, created_by
  ) values (
    p_product, v_product_name, v_supplier, p_region, p_location, -p_qty, 'liberacion',
    coalesce(nullif(btrim(p_note), ''), 'Botella liberada del banco'), v_rep
  );

  return v_avail - p_qty;
end;
$$;

revoke execute on function public.sample_bank_release(uuid, text, numeric, text, text)
  from public, anon;
grant execute on function public.sample_bank_release(uuid, text, numeric, text, text)
  to authenticated;
