-- El candado de capacitación rechaza vinos sin compra previa del cliente,
-- pero la compra se verifica contra monthly_sales_items, que se alimenta por
-- cargas manuales del reporte CONTPAQ. Cuando el cliente tiene una factura
-- MÁS RECIENTE que la última carga, el vendedor ve "no le has vendido" y
-- piensa que el CRM está mal (caso real: factura de hace 2 días, última carga
-- de hace 4).
--
-- Cambio: el mensaje de error ahora dice hasta cuándo hay ventas cargadas
-- (bitácora sales_imports, migración 0107), para que el vendedor entienda que
-- su factura reciente aún no aparece y sepa el camino (recargar el reporte o
-- pedir al admin que capture). La lógica del candado NO cambia: cuerpo tomado
-- de la versión vigente (0104, límite dinámico por conversión y retorno).

create or replace function public.tg_sample_client_cap()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_cap int;
  v_days int;
  v_this numeric;
  v_prev numeric;
  v_sin_compra text;
  v_corte date;
begin
  if new.status <> 'enviada' then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'enviada' then return new; end if;
  if public.is_admin() then return new; end if;
  if new.account_id is null then return new; end if;

  if new.training_people is not null then
    select string_agg(distinct i.product_name, ', ') into v_sin_compra
    from public.sample_request_items i
    where i.request_id = new.id
      and (i.product_id is null or not public.account_bought_product(new.account_id, i.product_id));
    if v_sin_compra is not null then
      select max(imported_at)::date into v_corte from public.sales_imports;
      raise exception
        'La capacitación es para vinos que el cliente ya compra. Sin compra previa registrada: %. Las ventas están cargadas hasta el %; si la factura es más reciente, aún no aparece en el CRM: pide al admin recargar el reporte de ventas o capturar la capacitación. Si no hay factura, quita esos vinos.',
        v_sin_compra, coalesce(to_char(v_corte, 'DD/MM/YYYY'), 'sin cargas registradas')
        using errcode = 'check_violation';
    end if;
    return new;
  end if;

  v_cap := public.sample_dynamic_client_limit(new.sales_rep_id);
  select client_window_days into v_days from public.sample_conversion_settings where id = true;
  select coalesce(sum(quantity), 0) into v_this
    from public.sample_request_items where request_id = new.id;
  v_prev := public.sample_bottles_to_account(new.account_id, v_days, new.id);

  if v_this + v_prev > v_cap then
    raise exception
      'Tu límite actual es % botella(s) por cliente cada % días según tu conversión y retorno. Este cliente lleva % y con esta solicitud serían %.',
      v_cap, v_days, v_prev, v_this + v_prev using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
