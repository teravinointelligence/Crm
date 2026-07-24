-- Tope de muestras por categoría: 6 de vino Y 6 de cerveza por cliente / 30 días.
--
-- Antes (0092): un solo tope de 6 botellas combinadas por cliente en la ventana
-- rodante de 30 días. Ahora se cuentan por SEPARADO — hasta 6 no-cerveza
-- ("vino") y hasta 6 cerveza — porque son consumos distintos y un cliente puede
-- estar catando ambos a la vez.
--
-- Bucket = el mismo criterio que el banco de muestras (0089): un producto con
-- category = 'cerveza' cuenta como cerveza; TODO lo demás (vino_tinto/blanco/
-- rosado/naranja, espumoso, destilado, sake, otro, sin categoría y los renglones
-- manuales sin producto del catálogo) cuenta como "vino".
--
-- FOOTGUN: el número (6) vive AQUÍ y en SAMPLE_CAP de lib/samples.ts (textos de
-- la UI). Si cambias uno, cambia el otro. Mismo patrón que el 5% de descuentos.

-- Botellas de muestra que ha recibido una cuenta en los últimos p_days días,
-- contando solo solicitudes vivas (enviada/aprobada/entregada). p_exclude excluye
-- la solicitud que se está validando. p_bucket filtra por categoría:
--   null       → todas (compatibilidad hacia atrás)
--   'cerveza'  → solo cerveza
--   'vino'     → todo lo no-cerveza (incluye renglones sin producto de catálogo)
drop function if exists public.sample_bottles_to_account(uuid, int, uuid);
create or replace function public.sample_bottles_to_account(
  p_account uuid,
  p_days int default 30,
  p_exclude uuid default null,
  p_bucket text default null
) returns numeric language sql stable security definer set search_path = public as $$
  select coalesce(sum(i.quantity), 0)
  from public.sample_requests r
  join public.sample_request_items i on i.request_id = r.id
  left join public.products p on p.id = i.product_id
  where r.account_id = p_account
    and r.status in ('enviada', 'aprobada', 'entregada')
    and r.created_at >= now() - make_interval(days => p_days)
    and (p_exclude is null or r.id <> p_exclude)
    and (
      p_bucket is null
      or (p_bucket = 'cerveza' and coalesce(p.category, '') =  'cerveza')
      or (p_bucket = 'vino'    and coalesce(p.category, '') <> 'cerveza')
    );
$$;

-- Candado de ENVÍO: al pasar a 'enviada',
--   * solicitud normal: por cada categoría (vino / cerveza), las botellas de
--     esta solicitud + las del cliente en 30 días no pueden pasar del tope;
--   * capacitación: todos los vinos deben tener compra previa del cliente
--     (sin cambios respecto a 0092).
create or replace function public.tg_sample_client_cap()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_cap constant numeric := 6;   -- botellas por cliente, por categoría, por ventana
  v_days constant int := 30;     -- días de la ventana rodante
  v_this_vino numeric;
  v_this_cerveza numeric;
  v_prev_vino numeric;
  v_prev_cerveza numeric;
  v_sin_compra text;
begin
  if new.status <> 'enviada' then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'enviada' then return new; end if; -- ya estaba enviada
  if public.is_admin() then return new; end if;
  if new.account_id is null then return new; end if;      -- sin cliente principal no aplica

  if new.training_people is not null then
    -- Capacitación: exenta del tope, pero solo de vinos que el cliente ya
    -- compra. Los renglones manuales (sin producto del catálogo) no se pueden
    -- verificar y también se rechazan.
    select string_agg(distinct i.product_name, ', ') into v_sin_compra
    from public.sample_request_items i
    where i.request_id = new.id
      and (i.product_id is null
           or not public.account_bought_product(new.account_id, i.product_id));
    if v_sin_compra is not null then
      raise exception
        'La capacitación es para vinos que el cliente ya compra (primero se encarta y compra, luego se capacita). Sin compra previa registrada: %. Quita esos vinos o pide autorización al admin.',
        v_sin_compra
        using errcode = 'check_violation';
    end if;
    return new;
  end if;

  -- Botellas de ESTA solicitud, separadas por categoría.
  select
    coalesce(sum(i.quantity) filter (where coalesce(p.category, '') <> 'cerveza'), 0),
    coalesce(sum(i.quantity) filter (where coalesce(p.category, '') =  'cerveza'), 0)
  into v_this_vino, v_this_cerveza
  from public.sample_request_items i
  left join public.products p on p.id = i.product_id
  where i.request_id = new.id;

  v_prev_vino    := public.sample_bottles_to_account(new.account_id, v_days, new.id, 'vino');
  v_prev_cerveza := public.sample_bottles_to_account(new.account_id, v_days, new.id, 'cerveza');

  if v_this_vino + v_prev_vino > v_cap then
    raise exception
      'Este cliente ya lleva % botella(s) de muestra de vino en los últimos % días y con esta solicitud serían %. El tope es % de vino por cliente; pide autorización al admin (él puede capturarla) o espera a que corra la ventana.',
      v_prev_vino, v_days, v_this_vino + v_prev_vino, v_cap
      using errcode = 'check_violation';
  end if;

  if v_this_cerveza + v_prev_cerveza > v_cap then
    raise exception
      'Este cliente ya lleva % botella(s) de muestra de cerveza en los últimos % días y con esta solicitud serían %. El tope es % de cerveza por cliente; pide autorización al admin (él puede capturarla) o espera a que corra la ventana.',
      v_prev_cerveza, v_days, v_this_cerveza + v_prev_cerveza, v_cap
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sample_client_cap on public.sample_requests;
create trigger trg_sample_client_cap
  before insert or update on public.sample_requests
  for each row execute function public.tg_sample_client_cap();
