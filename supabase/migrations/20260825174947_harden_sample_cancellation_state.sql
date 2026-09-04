-- Evita resolver una cancelacion sobre una muestra que cambio de estado
-- mientras la solicitud estaba pendiente. La UI y la API tambien lo bloquean,
-- pero esta validacion protege el inventario aun ante llamadas concurrentes.
create or replace function public.decide_sample_cancellation(
  p_request_id uuid, p_approve boolean, p_notes text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rep uuid := public.current_rep_id();
  v_request public.sample_requests%rowtype;
  v_region text;
  v_bucket record;
  v_shortage record;
begin
  if v_rep is null or not public.is_admin() then
    raise exception 'Solo administracion puede decidir cancelaciones';
  end if;

  select * into v_request
  from public.sample_requests
  where id = p_request_id
  for update;

  if not found then raise exception 'Solicitud no encontrada'; end if;
  if v_request.cancellation_requested_at is null or v_request.cancellation_decision is not null then
    raise exception 'No hay una solicitud de cancelacion pendiente';
  end if;
  if v_request.status not in ('borrador', 'enviada', 'aprobada') then
    raise exception 'La muestra cambio al estado %; ya no se puede resolver esta cancelacion', v_request.status;
  end if;

  if p_approve and v_request.status = 'aprobada' then
    select primary_region into v_region
    from public.sales_reps
    where id = v_request.sales_rep_id;

    -- Usa la misma cerradura que tomar/liberar para que la comprobacion y la
    -- reversa sean atomicas por producto, region y ubicacion. El orden estable
    -- evita interbloqueos cuando una solicitud contiene varios productos.
    for v_bucket in
      select product_id, location
      from public.sample_bank_movements
      where source_request_id = p_request_id and kind = 'ingreso'
      group by product_id, location
      order by product_id, location nulls first
    loop
      perform pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(
          v_bucket.product_id::text || '|' || coalesce(v_region, '') || '|' || coalesce(v_bucket.location, ''),
          0
        )
      );
    end loop;

    select own.product_id, own.location, own.quantity, coalesce(total.available, 0) as available
      into v_shortage
    from (
      select product_id, location, sum(quantity) quantity
      from public.sample_bank_movements
      where source_request_id = p_request_id and kind = 'ingreso'
      group by product_id, location
    ) own
    left join lateral (
      select sum(quantity) available
      from public.sample_bank_movements m
      where m.product_id = own.product_id
        and m.region is not distinct from v_region
        and m.location is not distinct from own.location
    ) total on true
    where coalesce(total.available, 0) < own.quantity
    limit 1;

    if found then
      raise exception 'No se puede cancelar: parte del producto % ya fue tomada del banco en %',
        v_shortage.product_id, coalesce(v_shortage.location, 'ubicacion sin asignar');
    end if;

    delete from public.sample_bank_movements
    where source_request_id = p_request_id and kind = 'ingreso';
  end if;

  update public.sample_requests set
    cancellation_decided_at = now(),
    cancellation_decided_by = v_rep,
    cancellation_decision = case when p_approve then 'aprobada' else 'rechazada' end,
    cancellation_decision_notes = nullif(left(btrim(coalesce(p_notes, '')), 2000), ''),
    status = case when p_approve then 'cancelada' else status end,
    cancelled_at = case when p_approve then now() else cancelled_at end,
    cancelled_by = case when p_approve then v_rep else cancelled_by end
  where id = p_request_id;
end;
$$;

revoke all on function public.decide_sample_cancellation(uuid, boolean, text)
  from public, anon;
grant execute on function public.decide_sample_cancellation(uuid, boolean, text)
  to authenticated;

-- Serializa tambien las tomas con la misma llave. Conserva toda la logica de
-- limites dinamicos de 0104_sample_conversion_roi y solo endurece la seccion
-- que comprueba y descuenta existencias.
create or replace function public.sample_bank_take(
  p_product uuid,
  p_region text,
  p_qty numeric,
  p_note text default null,
  p_location text default null,
  p_account uuid default null
)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rep uuid;
  v_region text;
  v_avail numeric;
  v_used numeric;
  v_limit int;
  v_days int;
begin
  v_rep := public.current_rep_id();
  if v_rep is null then raise exception 'No autenticado'; end if;
  if p_account is null then raise exception 'Selecciona el cliente para medir la conversión de la muestra'; end if;

  select primary_region into v_region
  from public.sales_reps
  where id = v_rep;

  if not public.is_admin() and v_region is distinct from p_region then
    raise exception 'Solo puedes tomar muestras de tu zona';
  end if;
  if p_qty is null or p_qty <= 0 then raise exception 'Cantidad inválida'; end if;

  if not public.is_admin() then
    v_limit := public.sample_dynamic_client_limit(v_rep);
    select client_window_days into v_days
    from public.sample_conversion_settings
    where id = true;

    select coalesce(sum(quantity), 0) into v_used
    from public.sample_conversion_events
    where sales_rep_id = v_rep
      and account_id = p_account
      and sample_date >= current_date - v_days;

    if v_used + p_qty > v_limit then
      raise exception
        'Tu límite actual es % botella(s) por cliente cada % días según tu conversión y retorno. Este cliente ya lleva %.',
        v_limit, v_days, v_used using errcode = 'check_violation';
    end if;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_product::text || '|' || coalesce(p_region, '') || '|' || coalesce(p_location, ''),
      0
    )
  );

  select coalesce(sum(quantity), 0) into v_avail
  from public.sample_bank_movements
  where product_id = p_product
    and region is not distinct from p_region
    and location is not distinct from p_location;

  if v_avail < p_qty then
    raise exception 'No hay suficientes botellas en el banco (disponibles: %)', v_avail
      using errcode = 'check_violation';
  end if;

  insert into public.sample_bank_movements(
    product_id, product_name, supplier, region, location, quantity, kind,
    taken_by, account_id, notes, created_by
  )
  select p_product, p.name, p.supplier, p_region, p_location, -p_qty, 'toma',
         v_rep, p_account, p_note, v_rep
  from public.products p
  where p.id = p_product;

  return v_avail - p_qty;
end;
$$;

revoke execute on function public.sample_bank_take(uuid, text, numeric, text, text, uuid)
  from public, anon;
grant execute on function public.sample_bank_take(uuid, text, numeric, text, text, uuid)
  to authenticated;
