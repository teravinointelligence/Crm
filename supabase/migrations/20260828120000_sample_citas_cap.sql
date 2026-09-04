-- Tope de muestras basado en las citas del vendedor.
--
-- Regla: el gasto de muestras debe seguir la actividad real del vendedor, no
-- un número fijo. Estándar TERAVINO: máximo 3 vinos por cita presencial.
--   1. Por solicitud: las botellas no pueden superar 3 × citas ligadas
--      (las citas presenciales que ya exige el candado de la migración 0023).
--   2. Por mes: las botellas de las solicitudes vivas del mes calendario no
--      pueden superar 3 × citas distintas ligadas a esas solicitudes. Una
--      cita reciclada en varias solicitudes solo da cupo una vez.
-- Con más citas el cupo sube solo (prospección o capacitación); sin citas no
-- hay cupo. Aplica también a capacitaciones: una capacitación es una cita y
-- lleva máximo 3 vinos; si de verdad necesita más, el Admin la captura.
-- El Admin queda exento, como en los demás candados de muestras.
--
-- FOOTGUN: el límite (3 vinos por cita) vive AQUÍ y en SAMPLE_CITA_CAP de
-- lib/samples.ts (textos de la UI). Si cambias uno, cambia el otro.

-- Limpieza de un borrador previo de esta migración (tope fijo mensual) por si
-- llegó a aplicarse en algún ambiente; en limpio estos objetos no existen.
drop trigger if exists trg_sample_rep_monthly_cap on public.sample_requests;
drop function if exists public.tg_sample_rep_monthly_cap();
drop function if exists public.rep_degustacion_bottles_this_month(uuid, uuid);
drop function if exists public.my_degustacion_bottles_this_month();

-- Citas presenciales vivas ligadas a una solicitud (mismos tipos que el
-- candado de citas de la migración 0023).
create or replace function public.sample_request_citas(p_request uuid)
returns int
language sql stable security definer set search_path = ''
as $$
  select count(distinct a.id)::int
  from public.sample_request_activities sra
  join public.activities a on a.id = sra.activity_id
  where sra.request_id = p_request
    and a.status <> 'cancelada'
    and a.activity_type in ('visita', 'degustacion', 'reunion', 'evento');
$$;

revoke execute on function public.sample_request_citas(uuid) from public, anon;
grant execute on function public.sample_request_citas(uuid) to authenticated;

-- Botellas y citas distintas de las solicitudes vivas del mes calendario de
-- un vendedor. p_exclude permite excluir la solicitud que se está validando.
create or replace function public.rep_sample_month_usage(
  p_rep uuid,
  p_exclude uuid default null
) returns table(bottles numeric, citas int)
language sql stable security definer set search_path = ''
as $$
  with vivas as (
    select r.id
    from public.sample_requests r
    where r.sales_rep_id = p_rep
      and r.status in ('enviada', 'aprobada', 'entregada')
      and r.created_at >= date_trunc('month', now())
      and (p_exclude is null or r.id <> p_exclude)
  )
  select
    coalesce((
      select sum(i.quantity)
      from public.sample_request_items i
      where i.request_id in (select id from vivas)
    ), 0),
    coalesce((
      select count(distinct a.id)::int
      from public.sample_request_activities sra
      join public.activities a on a.id = sra.activity_id
      where sra.request_id in (select id from vivas)
        and a.status <> 'cancelada'
        and a.activity_type in ('visita', 'degustacion', 'reunion', 'evento')
    ), 0);
$$;

revoke execute on function public.rep_sample_month_usage(uuid, uuid) from public, anon;
grant execute on function public.rep_sample_month_usage(uuid, uuid) to authenticated;

-- Variante sin argumentos para la UI: consumo del mes del vendedor autenticado.
create or replace function public.my_sample_month_usage()
returns table(bottles numeric, citas int)
language sql stable security definer set search_path = ''
as $$
  select * from public.rep_sample_month_usage(public.current_rep_id());
$$;

revoke execute on function public.my_sample_month_usage() from public, anon;
grant execute on function public.my_sample_month_usage() to authenticated;

-- Candado de ENVÍO: al pasar a 'enviada' se validan los dos topes.
create or replace function public.tg_sample_citas_cap()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_por_cita constant numeric := 3;  -- vinos por cita presencial
  v_this numeric;
  v_citas int;
  v_month record;
  v_month_citas int;
begin
  if new.status <> 'enviada' then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'enviada' then return new; end if; -- ya estaba enviada
  if public.is_admin() then return new; end if;

  select coalesce(sum(quantity), 0) into v_this
    from public.sample_request_items where request_id = new.id;
  v_citas := public.sample_request_citas(new.id);

  if v_this > v_por_cita * greatest(v_citas, 1) then
    raise exception
      'Vas por % botella(s) con % cita(s) ligada(s): el estándar es máximo % vinos por cita. Liga las citas donde usarás las muestras o quita vinos; si de verdad necesitas más (p. ej. una capacitación grande), pide autorización al admin (él puede capturarla).',
      v_this, v_citas, v_por_cita
      using errcode = 'check_violation';
  end if;

  select * into v_month from public.rep_sample_month_usage(new.sales_rep_id, new.id);

  -- Citas distintas del mes contando también las de esta solicitud: una cita
  -- reciclada en dos solicitudes solo da cupo una vez.
  select count(distinct a.id)::int into v_month_citas
  from public.sample_request_activities sra
  join public.activities a on a.id = sra.activity_id
  where (sra.request_id = new.id
         or sra.request_id in (
              select r.id
              from public.sample_requests r
              where r.sales_rep_id = new.sales_rep_id
                and r.id <> new.id
                and r.status in ('enviada', 'aprobada', 'entregada')
                and r.created_at >= date_trunc('month', now())))
    and a.status <> 'cancelada'
    and a.activity_type in ('visita', 'degustacion', 'reunion', 'evento');

  if v_month.bottles + v_this > v_por_cita * greatest(v_month_citas, 1) then
    raise exception
      'Este mes llevas % botella(s) de muestra con % cita(s) ligada(s); con esta solicitud serían % y tu cupo es % (máximo % vinos por cita). Con más citas el cupo sube solo; para una excepción pide autorización al admin.',
      v_month.bottles, v_month_citas, v_month.bottles + v_this,
      v_por_cita * greatest(v_month_citas, 1), v_por_cita
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sample_citas_cap on public.sample_requests;
create trigger trg_sample_citas_cap
  before insert or update on public.sample_requests
  for each row execute function public.tg_sample_citas_cap();
