-- Nuevo estatus de cuenta: 'cerrado' — el negocio cerró definitivamente.
-- Distinto de 'perdido' (lo perdimos como cliente pero el negocio sigue operando).

alter table public.accounts drop constraint accounts_status_check;
alter table public.accounts add constraint accounts_status_check
  check (status = any (array['prospecto'::text, 'activo'::text, 'inactivo'::text, 'perdido'::text, 'cerrado'::text]));
