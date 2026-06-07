-- =====================================================================
-- Envío de muestras al cliente
-- =====================================================================
-- Cuando el cliente pide que se le ENVÍEN las muestras (para probarlas con sus
-- directivos), esas botellas NO deben quedarse en el banco de muestras de la
-- zona: salen al cliente. El vendedor marca la solicitud como "envío al cliente"
-- e indica la fecha en que se necesitan enviar; el cliente debe estar registrado
-- (account_id obligatorio, validado en el formulario).
-- =====================================================================

alter table public.sample_requests
  add column if not exists ship_to_client boolean not null default false;
alter table public.sample_requests
  add column if not exists ship_date date;

-- Surtir el banco al AUTORIZAR (transición a 'aprobada'), EXCEPTO cuando la
-- solicitud es un envío al cliente: esas botellas no entran al banco.
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
    where i.request_id = new.id and i.product_id is not null and i.quantity > 0;
  end if;
  return new;
end;
$$;
