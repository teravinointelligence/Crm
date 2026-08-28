-- Tope mensual de muestras de DEGUSTACIÓN por vendedor.
--
-- Problema: el gasto de botellas de degustación crece sin freno (hay
-- vendedores con 14+ botellas/mes constantes y picos de 23). Regla nueva:
--   * Un vendedor no puede enviar más de 12 botellas de degustación por mes
--     calendario (sumando sus solicitudes vivas del mes: enviadas, aprobadas
--     y entregadas).
--   * Las capacitaciones (training_people) quedan FUERA de este tope: ya
--     tienen su propio candado (solo vinos con compra previa del cliente,
--     migración 0092) y por diseño llevan más botellas.
--   * El Admin queda exento, como en los demás candados de muestras: es la
--     válvula de escape cuando hay una razón válida para exceder el tope.
--
-- El número (12) se calibró con el consumo del vendedor con más ventas:
-- equivale a ~4 degustaciones de 3 vinos al mes.
--
-- FOOTGUN: el límite vive AQUÍ y en SAMPLE_REP_CAP de lib/samples.ts (texto
-- de ayuda del formulario). Si cambias uno, cambia el otro. (Mismo patrón que
-- el tope de 6 botellas por cliente de la migración 0092.)

-- Botellas de degustación (solicitudes sin training_people) que lleva un
-- vendedor en el mes calendario en curso, contando solicitudes vivas.
-- p_exclude permite excluir la solicitud que se está validando.
create or replace function public.rep_degustacion_bottles_this_month(
  p_rep uuid,
  p_exclude uuid default null
) returns numeric
language sql stable security definer set search_path = ''
as $$
  select coalesce(sum(i.quantity), 0)
  from public.sample_requests r
  join public.sample_request_items i on i.request_id = r.id
  where r.sales_rep_id = p_rep
    and r.training_people is null
    and r.status in ('enviada', 'aprobada', 'entregada')
    and r.created_at >= date_trunc('month', now())
    and (p_exclude is null or r.id <> p_exclude);
$$;

revoke execute on function public.rep_degustacion_bottles_this_month(uuid, uuid)
  from public, anon;
grant execute on function public.rep_degustacion_bottles_this_month(uuid, uuid)
  to authenticated;

-- Variante sin argumentos para la UI: cuánto lleva el vendedor autenticado.
create or replace function public.my_degustacion_bottles_this_month()
returns numeric
language sql stable security definer set search_path = ''
as $$
  select public.rep_degustacion_bottles_this_month(public.current_rep_id());
$$;

revoke execute on function public.my_degustacion_bottles_this_month()
  from public, anon;
grant execute on function public.my_degustacion_bottles_this_month()
  to authenticated;

-- Candado de ENVÍO: al pasar a 'enviada', las botellas de esta solicitud más
-- las del vendedor en el mes no pueden superar el tope.
create or replace function public.tg_sample_rep_monthly_cap()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_cap constant numeric := 12;  -- botellas de degustación por vendedor por mes
  v_this numeric;
  v_prev numeric;
begin
  if new.status <> 'enviada' then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'enviada' then return new; end if; -- ya estaba enviada
  if public.is_admin() then return new; end if;
  if new.training_people is not null then return new; end if; -- capacitación: tiene su propio candado

  select coalesce(sum(quantity), 0) into v_this
    from public.sample_request_items where request_id = new.id;
  v_prev := public.rep_degustacion_bottles_this_month(new.sales_rep_id, new.id);

  if v_this + v_prev > v_cap then
    raise exception
      'Ya llevas % botella(s) de degustación este mes y con esta solicitud serían %. El tope es % por vendedor al mes; prioriza tus degustaciones o pide autorización al admin (él puede capturarla). Las capacitaciones de vinos que el cliente ya compra no cuentan para este tope.',
      v_prev, v_this + v_prev, v_cap
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sample_rep_monthly_cap on public.sample_requests;
create trigger trg_sample_rep_monthly_cap
  before insert or update on public.sample_requests
  for each row execute function public.tg_sample_rep_monthly_cap();
