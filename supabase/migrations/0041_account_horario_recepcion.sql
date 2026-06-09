-- Horario de recepción de mercancía del cliente.
-- Lo captura el vendedor en la cuenta (texto libre, p. ej. "Lun-Vie 8:00-13:00")
-- y Reparto lo muestra para planear entregas. Reparto enlaza por RFC con su
-- propia tabla reparto.clientes (que ya tiene su columna homónima como respaldo).

alter table public.accounts
  add column if not exists horario_recepcion text;

comment on column public.accounts.horario_recepcion is
  'Horario en que el cliente recibe mercancía (texto libre). Capturado por el vendedor; visible en Reparto.';
