-- =====================================================================
-- Muestras: recuperar la mitad perdida de "Producto terminado" (0090)
-- =====================================================================
-- 0090 se aplicó a producción el 2026-07-14, pero el 2026-08-06 una
-- migración correctiva (`restore_sample_rules_from_main`) revirtió unos
-- cambios de muestras que se habían aplicado por error desde una rama
-- vieja. Al "restaurar desde main" recreó `tg_sample_no_reuse` y
-- `rep_locked_sample_products` con las versiones de 0089 — porque 0090
-- nunca se mergeó a main y por tanto no existía ahí.
--
-- Resultado: la BD quedó a medias. Sobrevivieron el tipo de movimiento
-- 'terminado', las columnas finished_at/finished_by y el RPC
-- sample_product_finish; pero los dos lugares que LEEN finished_at se
-- fueron. El botón escribía finished_at y no liberaba nada.
--
-- Esta migración vuelve a poner esas dos funciones (idénticas a 0090).
-- Es idempotente: en un entorno limpio 0090 ya las dejó así y esto no
-- cambia nada. Va como 0099 en vez de tocar 0090 porque 0090 ya está
-- registrada como aplicada en prod y no volvería a correr.
--
-- Ver también: el PR que mergea 0090 a main, sin el cual cualquier
-- "restaurar desde main" futuro vuelve a borrar esto.
-- =====================================================================

-- Candado de reuso: las partidas terminadas ya no bloquean.
-- (0089 —cervezas exentas— + filtro finished_at.)
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

-- El trigger ya existe (lo recreó la migración del 2026-08-06 apuntando a
-- esta misma función), pero lo aseguramos para entornos limpios.
drop trigger if exists trg_sample_no_reuse on public.sample_request_items;
create trigger trg_sample_no_reuse
  before insert on public.sample_request_items
  for each row execute function public.tg_sample_no_reuse();

-- Vinos bloqueados que pinta la UI del formulario: mismo filtro.
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
