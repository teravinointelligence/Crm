-- Ajuste de la regla de muestras (v2):
--  * Para ENVIAR una solicitud basta 1 cita agendada (antes eran 3).
--  * No se puede volver a pedir el MISMO vino hasta haberlo usado con 3
--    clientes distintos. Las citas se van sumando a la solicitud con el tiempo.
--  El Admin queda exento de ambas reglas.

-- Clientes distintos (presenciales, no canceladas) que cubre una solicitud.
create or replace function public.sample_distinct_clients(p_request uuid)
returns int language sql stable security definer set search_path = public as $$
  select count(distinct a.account_id)::int
  from public.sample_request_activities sra
  join public.activities a on a.id = sra.activity_id
  where sra.request_id = p_request
    and a.status <> 'cancelada'
    and a.account_id is not null
    and a.activity_type in ('visita', 'degustacion', 'reunion', 'evento');
$$;

-- Candado de ENVÍO: al menos 1 cita con un cliente.
create or replace function public.tg_sample_requires_citas()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'enviada'
     and (tg_op = 'INSERT' or old.status is distinct from 'enviada')
     and not public.is_admin()
     and public.sample_distinct_clients(new.id) < 1 then
    raise exception 'Para solicitar una muestra necesitas al menos 1 cita agendada con un cliente.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

-- Candado de REUSO: no pedir el mismo vino si ya hay una solicitud
-- (enviada/aprobada/entregada) de ese vino sin completar sus 3 clientes distintos.
create or replace function public.tg_sample_no_reuse()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_rep uuid;
  v_open int;
begin
  if new.product_id is null then return new; end if;        -- vinos manuales no se bloquean
  if public.is_admin() then return new; end if;
  select sales_rep_id into v_rep from public.sample_requests where id = new.request_id;
  select count(*) into v_open
  from public.sample_requests r2
  join public.sample_request_items i2 on i2.request_id = r2.id
  where r2.sales_rep_id = v_rep
    and r2.id <> new.request_id
    and r2.status in ('enviada', 'aprobada', 'entregada')
    and i2.product_id = new.product_id
    and public.sample_distinct_clients(r2.id) < 3;
  if v_open > 0 then
    raise exception 'Ya tienes una muestra de este vino en uso; complétala con 3 clientes distintos antes de volver a pedirla.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sample_no_reuse on public.sample_request_items;
create trigger trg_sample_no_reuse
  before insert on public.sample_request_items
  for each row execute function public.tg_sample_no_reuse();

-- Vinos "en uso" del vendedor actual (para avisar/bloquear en el formulario).
create or replace function public.rep_locked_sample_products()
returns table(product_id uuid) language sql stable security definer set search_path = public as $$
  select distinct i.product_id
  from public.sample_requests r
  join public.sample_request_items i on i.request_id = r.id
  where r.sales_rep_id = public.current_rep_id()
    and r.status in ('enviada', 'aprobada', 'entregada')
    and i.product_id is not null
    and public.sample_distinct_clients(r.id) < 3;
$$;
