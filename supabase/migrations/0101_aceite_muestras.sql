-- =====================================================================
-- Aceite de oliva: categoría propia y muestras de un solo uso
-- =====================================================================
-- Yamile pidió una muestra del "Gomez Cruzado Aceite De Oliva Extra Virgen"
-- para Toro Latin Kitchen (MUE-2026-0066) y al querer pedir otra para OTRO
-- cliente el CRM la bloqueó dos veces:
--   1. tg_sample_no_reuse — "ya tienes una muestra de este vino en uso;
--      complétala con 3 clientes distintos antes de volver a pedirla";
--   2. tg_sample_in_bank — al aprobar su solicitud la botella entró al banco
--      de muestras de Los Cabos, así que el formulario le respondía
--      "tómala del banco" en vez de dejarla pedir otra.
--
-- Las dos reglas dan por hecho una botella de VINO: se descorcha, se sirve una
-- cata y la misma botella sirve para el siguiente cliente. Un aceite de oliva
-- no funciona así — se abre, se prueba con pan y se queda con el cliente —
-- exactamente el mismo caso que la cerveza (migración 0089).
--
-- En vez de repetir la excepción de la cerveza en cada candado, aquí se
-- generaliza a "muestras de un solo uso" con un helper único:
-- public.sample_single_use_product(product_id).
--
-- FOOTGUN: las categorías de un solo uso viven AQUÍ y en
-- SAMPLE_SINGLE_USE_CATEGORIES de lib/samples.ts (textos de la UI).
-- Si cambias una, cambia la otra.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Categoría 'aceite' en el catálogo
-- ---------------------------------------------------------------------
-- El aceite vivía en 'otro', junto con todo lo que no es vino ni destilado.
-- Necesita categoría propia para que las reglas puedan distinguirlo.
alter table public.products drop constraint if exists products_category_check;
alter table public.products add constraint products_category_check
  check (category in
    ('vino_tinto','vino_blanco','vino_rosado','vino_naranja','espumoso',
     'destilado','cerveza','sake','aceite','otro'));

update public.products
set category = 'aceite'
where coalesce(category, '') in ('', 'otro')
  and (name ilike '%aceite de oliva%'
       or name ilike '%olive oil%'
       or (name ilike '%aceite%' and name ilike '%oliva%'));

-- ---------------------------------------------------------------------
-- 2. Helper: ¿la muestra es de un solo uso?
-- ---------------------------------------------------------------------
-- Botellas que no se pueden reutilizar con el siguiente cliente: ni entran al
-- banco de muestras ni tiene sentido pedirles 3 clientes distintos.
create or replace function public.sample_single_use_product(p_product uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    (select p.category in ('cerveza', 'aceite') from public.products p where p.id = p_product),
    false
  );
$$;

-- ---------------------------------------------------------------------
-- 3. Candados de reuso (3 clientes distintos)
-- ---------------------------------------------------------------------
-- OJO (drift): en producción `sample_request_items` ya tiene la columna
-- `finished_at` (botón "Producto terminado", migración 0090 de su rama, aún
-- sin mergear a main) y estas dos funciones la filtran allá. Para no borrar esa
-- condición al reemplazarlas, el cuerpo se arma con ese filtro SOLO si la
-- columna existe: en producción se conserva, y en una base creada desde main
-- (donde la columna todavía no existe) la función queda sin él.
do $mig$
declare
  v_has_finished boolean := exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'sample_request_items'
      and column_name = 'finished_at'
  );
  v_fin_i  text := case when v_has_finished then 'and i.finished_at is null'  else '' end;
  v_fin_i2 text := case when v_has_finished then 'and i2.finished_at is null' else '' end;
begin
  -- Productos "en uso" del vendedor actual (los que el formulario pinta con
  -- candado). Los de un solo uso nunca se bloquean.
  execute format($f$
    create or replace function public.rep_locked_sample_products()
    returns table(product_id uuid) language sql stable security definer set search_path = public as $body$
      select distinct i.product_id
      from public.sample_requests r
      join public.sample_request_items i on i.request_id = r.id
      where r.sales_rep_id = public.current_rep_id()
        and r.status in ('enviada', 'aprobada', 'entregada')
        and i.product_id is not null
        %s
        and not public.sample_single_use_product(i.product_id)
        and public.sample_distinct_clients(r.id) < 3;
    $body$;
  $f$, v_fin_i);

  -- Candado de servidor equivalente, al agregar el renglón a la solicitud.
  execute format($f$
    create or replace function public.tg_sample_no_reuse()
    returns trigger language plpgsql security definer set search_path = public as $body$
    declare v_rep uuid; v_open int;
    begin
      if new.product_id is null then return new; end if;         -- renglón manual
      if public.is_admin() then return new; end if;
      -- Cerveza y aceite se consumen con el cliente: no se reutilizan.
      if public.sample_single_use_product(new.product_id) then return new; end if;
      select sales_rep_id into v_rep from public.sample_requests where id = new.request_id;
      select count(*) into v_open
      from public.sample_requests r2
      join public.sample_request_items i2 on i2.request_id = r2.id
      where r2.sales_rep_id = v_rep
        and r2.id <> new.request_id
        and r2.status in ('enviada', 'aprobada', 'entregada')
        and i2.product_id = new.product_id
        %s
        and public.sample_distinct_clients(r2.id) < 3;
      if v_open > 0 then
        raise exception 'Ya tienes una muestra de este producto en uso; complétala con 3 clientes distintos antes de volver a pedirla.'
          using errcode = 'check_violation';
      end if;
      return new;
    end;
    $body$;
  $f$, v_fin_i2);
end
$mig$;

-- ---------------------------------------------------------------------
-- 4. Banco de muestras
-- ---------------------------------------------------------------------
-- Las botellas de un solo uso no entran al banco al autorizar la solicitud.
-- (Se restaura además el candado de `ship_to_client` de la migración 0032, que
-- la 0089 perdió al reemplazar esta función: lo que se envía al cliente sale de
-- la casa, no se queda en el banco de la zona.)
create or replace function public.tg_sample_bank_on_approve()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_region text;
begin
  if new.status = 'aprobada' and tg_op = 'UPDATE' and old.status is distinct from 'aprobada'
     and coalesce(new.ship_to_client, false) = false then
    select primary_region into v_region from public.sales_reps where id = new.sales_rep_id;
    insert into public.sample_bank_movements(product_id, product_name, supplier, region, quantity, kind, source_request_id, created_by)
    select i.product_id, i.product_name, i.supplier, v_region, i.quantity, 'ingreso', new.id, new.reviewed_by
    from public.sample_request_items i
    where i.request_id = new.id
      and i.product_id is not null
      and i.quantity > 0
      and not public.sample_single_use_product(i.product_id);
  end if;
  return new;
end;
$$;

-- Disponibles del banco en la zona del vendedor: se omiten los de un solo uso.
-- Es lo que destraba a Yamile hoy — el aceite de su solicitud ya aprobada dejó
-- un saldo en el banco de Los Cabos que le seguiría diciendo "tómala de ahí".
-- El movimiento histórico se conserva (la bitácora es append-only); solo deja
-- de contar como disponible para pedir.
create or replace function public.rep_bank_available_products()
returns table(product_id uuid) language sql stable security definer set search_path = public as $$
  select m.product_id
  from public.sample_bank_movements m
  join public.sales_reps sr on sr.id = public.current_rep_id()
  where m.region is not distinct from sr.primary_region
    and not public.sample_single_use_product(m.product_id)
  group by m.product_id
  having sum(m.quantity) > 0;
$$;

-- Candado de servidor: no pedir algo que ya está en el banco de la zona.
create or replace function public.tg_sample_in_bank()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_region text; v_avail numeric;
begin
  if new.product_id is null then return new; end if;
  if public.is_admin() then return new; end if;
  -- Los de un solo uso no entran al banco: nunca se bloquean por esta regla.
  if public.sample_single_use_product(new.product_id) then return new; end if;
  select sr.primary_region into v_region
  from public.sample_requests r
  join public.sales_reps sr on sr.id = r.sales_rep_id
  where r.id = new.request_id;
  select coalesce(sum(quantity), 0) into v_avail
  from public.sample_bank_movements
  where product_id = new.product_id
    and region is not distinct from v_region;
  if v_avail > 0 then
    raise exception 'Este producto ya está en el banco de muestras de tu zona; tómalo de ahí antes de pedir otro.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
