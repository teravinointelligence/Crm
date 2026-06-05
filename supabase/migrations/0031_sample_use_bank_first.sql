-- Regla: si el vino ya está disponible en el banco de muestras de TU zona, no
-- puedes pedir otra muestra de ese vino: primero usa la del banco.
-- El Admin queda exento. Los vinos manuales (sin product_id) no se bloquean.

-- Vinos con stock en el banco de la zona del vendedor actual (para el formulario).
create or replace function public.rep_bank_available_products()
returns table(product_id uuid) language sql stable security definer set search_path = public as $$
  select m.product_id
  from public.sample_bank_movements m
  join public.sales_reps sr on sr.id = public.current_rep_id()
  where m.region is not distinct from sr.primary_region
  group by m.product_id
  having sum(m.quantity) > 0;
$$;

-- Candado de servidor: bloquea pedir un vino disponible en el banco de la zona
-- del vendedor dueño de la solicitud.
create or replace function public.tg_sample_in_bank()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_region text; v_avail numeric;
begin
  if new.product_id is null then return new; end if;
  if public.is_admin() then return new; end if;
  select sr.primary_region into v_region
  from public.sample_requests r
  join public.sales_reps sr on sr.id = r.sales_rep_id
  where r.id = new.request_id;
  select coalesce(sum(quantity), 0) into v_avail
  from public.sample_bank_movements
  where product_id = new.product_id
    and region is not distinct from v_region;
  if v_avail > 0 then
    raise exception 'Este vino ya está en el banco de muestras de tu zona; tómala de ahí antes de pedir otra.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sample_in_bank on public.sample_request_items;
create trigger trg_sample_in_bank
  before insert on public.sample_request_items
  for each row execute function public.tg_sample_in_bank();
