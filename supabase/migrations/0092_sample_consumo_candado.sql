-- Candado de consumo de muestras por cliente.
--
-- Problema: hay vendedores que piden 10-12 botellas de muestra para un solo
-- cliente. Reglas nuevas:
--   1. Un cliente no puede recibir más de 6 botellas de muestra en una ventana
--      rodante de 30 días (sumando las solicitudes enviadas, aprobadas y
--      entregadas hacia esa cuenta).
--   2. Las capacitaciones (training_people) llevan más botellas por diseño y
--      quedan fuera del tope, pero SOLO de vinos que el cliente YA COMPRÓ
--      (compra real en monthly_sales_items, cruzada por sku/codigo_contpaqi).
--      Es el flujo legítimo: primero encarta y compra, luego capacita a su
--      personal. Sin compra previa, la capacitación se rechaza.
--   El Admin queda exento de ambas, como en los demás candados de muestras.
--
-- FOOTGUN: el límite (6 botellas / 30 días) vive AQUÍ y en SAMPLE_CAP de
-- lib/samples.ts (texto de ayuda del formulario). Si cambias uno, cambia el
-- otro. (Mismo patrón que el 5% de descuentos: trigger + MAX_VENDOR_DISCOUNT_PCT.)

-- Botellas de muestra que ha recibido una cuenta en los últimos p_days días,
-- contando solicitudes vivas (enviada/aprobada/entregada; borradores,
-- rechazadas y canceladas no cuentan). p_exclude permite excluir la solicitud
-- que se está validando.
create or replace function public.sample_bottles_to_account(
  p_account uuid,
  p_days int default 30,
  p_exclude uuid default null
) returns numeric language sql stable security definer set search_path = public as $$
  select coalesce(sum(i.quantity), 0)
  from public.sample_requests r
  join public.sample_request_items i on i.request_id = r.id
  where r.account_id = p_account
    and r.status in ('enviada', 'aprobada', 'entregada')
    and r.created_at >= now() - make_interval(days => p_days)
    and (p_exclude is null or r.id <> p_exclude);
$$;

-- ¿El cliente ya compró este producto? Compra real de CONTPAQ: renglones de
-- monthly_sales_items cruzados por sku / codigo_contpaqi (mismo cruce que el
-- rastreo por producto de la ficha del catálogo).
create or replace function public.account_bought_product(p_account uuid, p_product uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.products p
    join public.monthly_sales_items mi
      on mi.codigo is not null
     and (mi.codigo = p.sku or mi.codigo = p.codigo_contpaqi)
    join public.monthly_sales ms on ms.id = mi.monthly_sale_id
    where p.id = p_product
      and ms.account_id = p_account
  );
$$;

-- Candado de ENVÍO: al pasar a 'enviada',
--   * solicitud normal: botellas de esta + las del cliente en 30 días ≤ tope;
--   * capacitación: todos los vinos deben tener compra previa del cliente.
create or replace function public.tg_sample_client_cap()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_cap constant numeric := 6;   -- botellas por cliente por ventana
  v_days constant int := 30;     -- días de la ventana rodante
  v_this numeric;
  v_prev numeric;
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

  select coalesce(sum(quantity), 0) into v_this
    from public.sample_request_items where request_id = new.id;
  v_prev := public.sample_bottles_to_account(new.account_id, v_days, new.id);

  if v_this + v_prev > v_cap then
    raise exception
      'Este cliente ya lleva % botella(s) de muestra en los últimos % días y con esta solicitud serían %. El tope es % por cliente; pide autorización al admin (él puede capturarla) o espera a que corra la ventana.',
      v_prev, v_days, v_this + v_prev, v_cap
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sample_client_cap on public.sample_requests;
create trigger trg_sample_client_cap
  before insert or update on public.sample_requests
  for each row execute function public.tg_sample_client_cap();
