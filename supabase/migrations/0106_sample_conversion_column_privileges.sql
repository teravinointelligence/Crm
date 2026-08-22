-- El vendedor sólo debe editar el seguimiento comercial. El costo, cliente,
-- vino, cantidad y vendedor se generan desde movimientos confiables.

revoke update on table public.sample_conversion_events from authenticated;
grant update (follow_up_status, follow_up_notes, next_follow_up_date)
  on table public.sample_conversion_events to authenticated;
