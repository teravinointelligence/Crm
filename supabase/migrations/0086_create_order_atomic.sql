-- Función atómica para crear una orden + sus partidas en una sola transacción.
-- Resuelve la race condition del duplicate key en orders_order_number_key:
-- el folio se genera y la orden se inserta sin gap entre ambas operaciones.
create or replace function public.create_order(
  p_account_id          uuid,
  p_sales_rep_id        uuid,
  p_order_type          text,
  p_warehouse           text,
  p_status              text,
  p_subtotal            numeric,
  p_iva                 numeric,
  p_total               numeric,
  p_notes               text,
  p_discount_pct        numeric,
  p_discount_requested_by   uuid,
  p_discount_authorized_by  uuid,
  p_discount_authorized_at  timestamptz,
  p_items               jsonb   -- [{product_id, product_name, supplier, vintage, quantity, unit, unit_price, line_total}]
) returns uuid
language plpgsql security definer as $$
declare
  v_order_id     uuid;
  v_order_number text;
  v_year         text;
begin
  v_year := to_char(current_date, 'YYYY');

  -- Lock per (tipo, año) para serializar la generación de folios sin bloquear
  -- operaciones de otros tipos o años.
  perform pg_advisory_xact_lock(
    hashtext('create_order_' || p_order_type || v_year)
  );

  -- Generar folio dentro de la misma transacción (ya con el lock activo).
  select public.next_order_number(p_order_type) into v_order_number;

  -- Insertar la orden.
  insert into public.orders (
    order_number, account_id, sales_rep_id, order_type, warehouse,
    status, subtotal, iva, total, notes, discount_pct,
    discount_requested_by, discount_authorized_by, discount_authorized_at
  ) values (
    v_order_number, p_account_id, p_sales_rep_id, p_order_type, p_warehouse,
    p_status, p_subtotal, p_iva, p_total, p_notes, coalesce(p_discount_pct, 0),
    p_discount_requested_by, p_discount_authorized_by, p_discount_authorized_at
  ) returning id into v_order_id;

  -- Insertar las partidas.
  insert into public.order_items (
    order_id, product_id, product_name, supplier, vintage,
    quantity, unit, unit_price, line_total
  )
  select
    v_order_id,
    nullif(item->>'product_id', '')::uuid,
    item->>'product_name',
    nullif(item->>'supplier', ''),
    nullif(item->>'vintage', ''),
    (item->>'quantity')::numeric,
    coalesce(nullif(item->>'unit', ''), 'botella'),
    (item->>'unit_price')::numeric,
    (item->>'line_total')::numeric
  from jsonb_array_elements(p_items) as item;

  return v_order_id;
end;
$$;
