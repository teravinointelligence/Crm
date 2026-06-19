-- =====================================================================
-- Fix: cancel_approved_sample usaba columnas inexistentes
-- =====================================================================
-- El RPC (0067) revertía los ingresos del banco con un DELETE sobre
-- `request_id` / `movement_type`, pero las columnas reales de
-- sample_bank_movements son `source_request_id` / `kind` (ver 0025). Por eso
-- cancelar una solicitud APROBADA truena ("column request_id does not exist")
-- y ni revierte el banco ni marca la solicitud como cancelada.
--
-- Solo se corrigen los nombres de columna; el comportamiento es el mismo:
-- al cancelar una aprobada se eliminan los ingresos que esa solicitud sumó
-- al banco (las botellas no usadas regresan a bodega).
-- =====================================================================

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
    delete from public.sample_bank_movements
    where source_request_id = p_request_id
      and kind = 'ingreso';
  end if;

  update public.sample_requests
  set
    status       = 'cancelada',
    cancelled_at = now(),
    cancelled_by = p_cancelled_by
  where id = p_request_id;
end;
$$;
