-- =====================================================================
-- Muestras: botón "Producto terminado" (banco + candado de reuso)
-- =====================================================================
-- Cuando las botellas de muestra de un vino se acaban (se sirvieron o
-- murieron abiertas) antes de completar sus 3 clientes distintos, el
-- vendedor quedaba atorado: el banco podía seguir mostrando disponibles
-- (candado tg_sample_in_bank) y/o el candado de reuso (tg_sample_no_reuse)
-- le impedía volver a pedir el mismo vino.
--
-- "Producto terminado" hace dos cosas:
--   1) Da de baja el remanente del bucket (vino, zona, bodega) con un
--      movimiento 'terminado' (negativo). No cuenta como 'toma', así que
--      no infla las usadas ni el % de encartes.
--   2) Si ya no queda stock del vino en la zona, marca como terminadas las
--      partidas abiertas (solicitudes aprobada/entregada) de ese vino para
--      los vendedores de la zona → se libera el candado de reuso y pueden
--      volver a pedirlo.
-- Pueden hacerlo el admin y los vendedores de su propia zona.
-- =====================================================================

-- 1) Nuevo tipo de movimiento: 'terminado' (cantidad negativa).
alter table public.sample_bank_movements drop constraint if exists sample_bank_movements_kind_check;
alter table public.sample_bank_movements
  add constraint sample_bank_movements_kind_check
  check (kind in ('ingreso', 'toma', 'devolucion', 'terminado'));

-- 2) Partidas terminadas: dejan de contar para el candado de reuso aunque
--    la solicitud siga en 'aprobada'/'entregada'.
alter table public.sample_request_items
  add column if not exists finished_at timestamptz,
  add column if not exists finished_by uuid references public.sales_reps(id) on delete set null;

-- ---------------------------------------------------------------------
-- Marcar un vino como terminado en una zona.
--   p_location:      bucket concreto (bodega) a dar de baja.
--   p_all_locations: true => da de baja el remanente de TODAS las bodegas
--                    de la zona (útil desde la ficha de la solicitud).
-- Devuelve jsonb: { baja, liberadas, region_disponible }.
-- ---------------------------------------------------------------------
create or replace function public.sample_product_finish(
  p_product uuid,
  p_region text,
  p_location text default null,
  p_note text default null,
  p_all_locations boolean default false
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_rep uuid; v_region text; v_baja numeric := 0; v_total numeric; v_items int := 0;
  rec record;
begin
  v_rep := public.current_rep_id();
  if v_rep is null then raise exception 'No autenticado'; end if;
  select primary_region into v_region from public.sales_reps where id = v_rep;
  if not public.is_admin() and (v_region is distinct from p_region) then
    raise exception 'Solo puedes terminar muestras de tu zona';
  end if;

  -- Da de baja el remanente por bucket (conserva la etiqueta de bodega).
  for rec in
    select location, sum(quantity) as avail
    from public.sample_bank_movements
    where product_id = p_product
      and region is not distinct from p_region
      and (p_all_locations or location is not distinct from p_location)
    group by location
    having sum(quantity) > 0
  loop
    insert into public.sample_bank_movements(
      product_id, product_name, supplier, region, location, quantity, kind, taken_by, notes, created_by
    )
    select p_product, p.name, p.supplier, p_region, rec.location, -rec.avail, 'terminado', v_rep,
           coalesce(nullif(btrim(p_note), ''), 'Producto terminado'), v_rep
    from public.products p where p.id = p_product;
    v_baja := v_baja + rec.avail;
  end loop;

  -- Si ya no queda stock del vino en la zona, libera el candado de reuso.
  select coalesce(sum(quantity), 0) into v_total
  from public.sample_bank_movements
  where product_id = p_product and region is not distinct from p_region;

  if v_total <= 0 then
    update public.sample_request_items i
       set finished_at = now(), finished_by = v_rep
      from public.sample_requests r
      join public.sales_reps sr on sr.id = r.sales_rep_id
     where r.id = i.request_id
       and i.product_id = p_product
       and i.finished_at is null
       and r.status in ('aprobada', 'entregada')
       and sr.primary_region is not distinct from p_region;
    get diagnostics v_items = row_count;
  end if;

  return jsonb_build_object('baja', v_baja, 'liberadas', v_items, 'region_disponible', v_total);
end;
$$;

-- ---------------------------------------------------------------------
-- Candado de reuso: las partidas terminadas ya no bloquean.
-- (Misma versión que 0089 —cervezas exentas— + filtro finished_at.)
-- ---------------------------------------------------------------------
create or replace function public.tg_sample_no_reuse()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v_rep uuid; v_open int; v_category text;
begin
  if new.product_id is null then return new; end if;
  if public.is_admin() then return new; end if;
  select coalesce(category, '') into v_category from public.products where id = new.product_id;
  if v_category = 'cerveza' then return new; end if;
  select sales_rep_id into v_rep from public.sample_requests where id = new.request_id;
  select count(*) into v_open
  from public.sample_requests r2
  join public.sample_request_items i2 on i2.request_id = r2.id
  where r2.sales_rep_id = v_rep
    and r2.id <> new.request_id
    and r2.status in ('enviada', 'aprobada', 'entregada')
    and i2.product_id = new.product_id
    and i2.finished_at is null
    and public.sample_distinct_clients(r2.id) < 3;
  if v_open > 0 then
    raise exception 'Ya tienes una muestra de este vino en uso; complétala con 3 clientes distintos antes de volver a pedirla.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create or replace function public.rep_locked_sample_products()
returns table(product_id uuid)
language sql stable security definer set search_path = 'public' as $$
  select distinct i.product_id
  from public.sample_requests r
  join public.sample_request_items i on i.request_id = r.id
  join public.products p on p.id = i.product_id
  where r.sales_rep_id = public.current_rep_id()
    and r.status in ('enviada', 'aprobada', 'entregada')
    and i.product_id is not null
    and i.finished_at is null
    and coalesce(p.category, '') <> 'cerveza'
    and public.sample_distinct_clients(r.id) < 3;
$$;
