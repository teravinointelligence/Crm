-- Agrega estado "cancelada" al módulo de muestras.
-- • Vendedor puede cancelar sus propias solicitudes en borrador o enviada.
-- • Admin puede cancelar cualquier solicitud que no esté ya entregada/rechazada/cancelada,
--   incluyendo aprobadas (en ese caso se revierten los movimientos del banco).
-- • Se agregan columnas de auditoría cancelled_at / cancelled_by.

-- 1. Ampliar check constraint de status
alter table public.sample_requests
  drop constraint if exists sample_requests_status_check;

alter table public.sample_requests
  add constraint sample_requests_status_check
  check (status in ('borrador','enviada','aprobada','entregada','rechazada','cancelada'));

-- 2. Columnas de auditoría
alter table public.sample_requests
  add column if not exists cancelled_at  timestamptz,
  add column if not exists cancelled_by  uuid references public.sales_reps(id);

-- 3. RLS: actualizar política de UPDATE para que el vendedor también pueda
--    poner status = 'cancelada' en sus solicitudes borrador/enviada.
--    (La política existente ya permite update en borrador/enviada — sólo
--    necesitamos asegurarnos de que "cancelada" esté permitida como destino.
--    El check constraint ya no la bloquea, y la policy no filtra el valor de
--    destino, sólo el de origen — así que no hay que cambiarla.)

-- 4. Función RPC para cancelar solicitudes aprobadas (solo admin).
--    Revierte los movimientos de ingreso del banco sumados al aprobarse.
create or replace function public.cancel_approved_sample(p_request_id uuid, p_cancelled_by uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  select status into v_status from sample_requests where id = p_request_id;

  if v_status is null then
    raise exception 'Solicitud no encontrada';
  end if;

  if v_status not in ('borrador','enviada','aprobada') then
    raise exception 'No se puede cancelar una solicitud en estado %', v_status;
  end if;

  -- Revertir ingresos al banco si estaba aprobada
  if v_status = 'aprobada' then
    -- Eliminar los movimientos de tipo "ingreso" creados al aprobar
    delete from public.sample_bank_movements
    where request_id = p_request_id
      and movement_type = 'ingreso';
  end if;

  -- Marcar como cancelada
  update public.sample_requests
  set
    status       = 'cancelada',
    cancelled_at = now(),
    cancelled_by = p_cancelled_by
  where id = p_request_id;
end;
$$;

-- Solo admin puede llamar la función de cancelar aprobadas
revoke all on function public.cancel_approved_sample(uuid, uuid) from public;
grant execute on function public.cancel_approved_sample(uuid, uuid) to authenticated;
-- La función tiene security definer; el caller debe ser admin (verificamos en la API).
