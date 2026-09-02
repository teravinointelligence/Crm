-- Flujo seguro de solicitudes de cancelacion de muestras.
alter table public.sample_requests
  add column if not exists cancellation_requested_at timestamptz,
  add column if not exists cancellation_requested_by uuid references public.sales_reps(id) on delete set null,
  add column if not exists cancellation_reason text,
  add column if not exists cancellation_decided_at timestamptz,
  add column if not exists cancellation_decided_by uuid references public.sales_reps(id) on delete set null,
  add column if not exists cancellation_decision text,
  add column if not exists cancellation_decision_notes text;

alter table public.sample_requests
  drop constraint if exists sample_requests_cancellation_decision_check;
alter table public.sample_requests
  add constraint sample_requests_cancellation_decision_check
  check (cancellation_decision is null or cancellation_decision in ('aprobada', 'rechazada'));

create index if not exists idx_sample_requests_cancellation_pending
  on public.sample_requests (cancellation_requested_at)
  where cancellation_requested_at is not null and cancellation_decision is null;
create index if not exists idx_sample_requests_cancellation_requested_by
  on public.sample_requests (cancellation_requested_by);
create index if not exists idx_sample_requests_cancellation_decided_by
  on public.sample_requests (cancellation_decided_by);

create or replace function public.request_sample_cancellation(p_request_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rep uuid := public.current_rep_id();
  v_request public.sample_requests%rowtype;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  if v_rep is null then raise exception 'No autenticado'; end if;
  if char_length(v_reason) < 5 then raise exception 'Escribe un motivo de al menos 5 caracteres'; end if;

  select * into v_request
  from public.sample_requests
  where id = p_request_id
  for update;
  if not found then raise exception 'Solicitud no encontrada'; end if;
  if not public.is_admin() and v_request.sales_rep_id <> v_rep then
    raise exception 'Solo puedes solicitar la cancelacion de tus muestras';
  end if;
  if v_request.status not in ('borrador', 'enviada', 'aprobada') then
    raise exception 'No se puede solicitar cancelacion en estado %', v_request.status;
  end if;
  if v_request.cancellation_requested_at is not null and v_request.cancellation_decision is null then
    raise exception 'Esta solicitud ya tiene una cancelacion pendiente';
  end if;

  update public.sample_requests set
    cancellation_requested_at = now(), cancellation_requested_by = v_rep,
    cancellation_reason = left(v_reason, 2000), cancellation_decided_at = null,
    cancellation_decided_by = null, cancellation_decision = null,
    cancellation_decision_notes = null
  where id = p_request_id;
end;
$$;

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
  v_shortage record;
begin
  if v_rep is null or not public.is_admin() then raise exception 'Solo administracion puede decidir cancelaciones'; end if;
  select * into v_request from public.sample_requests where id = p_request_id for update;
  if not found then raise exception 'Solicitud no encontrada'; end if;
  if v_request.cancellation_requested_at is null or v_request.cancellation_decision is not null then
    raise exception 'No hay una solicitud de cancelacion pendiente';
  end if;

  if p_approve and v_request.status = 'aprobada' then
    select primary_region into v_region from public.sales_reps where id = v_request.sales_rep_id;
    select own.product_id, own.quantity, coalesce(total.available, 0) as available
      into v_shortage
    from (
      select product_id, sum(quantity) quantity
      from public.sample_bank_movements
      where source_request_id = p_request_id and kind = 'ingreso'
      group by product_id
    ) own
    left join lateral (
      select sum(quantity) available from public.sample_bank_movements m
      where m.product_id = own.product_id and m.region is not distinct from v_region
    ) total on true
    where coalesce(total.available, 0) < own.quantity
    limit 1;
    if found then
      raise exception 'No se puede cancelar: parte del producto % ya fue tomada del banco', v_shortage.product_id;
    end if;
    delete from public.sample_bank_movements
    where source_request_id = p_request_id and kind = 'ingreso';
  end if;

  update public.sample_requests set
    cancellation_decided_at = now(), cancellation_decided_by = v_rep,
    cancellation_decision = case when p_approve then 'aprobada' else 'rechazada' end,
    cancellation_decision_notes = nullif(left(btrim(coalesce(p_notes, '')), 2000), ''),
    status = case when p_approve then 'cancelada' else status end,
    cancelled_at = case when p_approve then now() else cancelled_at end,
    cancelled_by = case when p_approve then v_rep else cancelled_by end
  where id = p_request_id;
end;
$$;

revoke all on function public.request_sample_cancellation(uuid, text) from public, anon;
grant execute on function public.request_sample_cancellation(uuid, text) to authenticated;
revoke all on function public.decide_sample_cancellation(uuid, boolean, text) from public, anon;
grant execute on function public.decide_sample_cancellation(uuid, boolean, text) to authenticated;

-- Retira el RPC anterior: era SECURITY DEFINER sin validacion interna de admin.
revoke all on function public.cancel_approved_sample(uuid, uuid) from public, anon, authenticated;
grant execute on function public.cancel_approved_sample(uuid, uuid) to service_role;
