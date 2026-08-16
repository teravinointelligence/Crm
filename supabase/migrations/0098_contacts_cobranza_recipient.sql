-- Separa, dentro de los contactos de cada cuenta, quién debe recibir los
-- correos de cobro (área administrativa), en vez de mandarlos a TODOS los
-- contactos con correo.
--
-- Transición segura: la columna nace en false. La lógica de armado de
-- destinatarios (lib/cobranza-email.ts y lib/cobranza-data.ts) manda solo a los
-- contactos marcados; y si una cuenta aún no tiene ninguno marcado, cae al
-- comportamiento previo (todos los contactos con correo). Así no se corta ningún
-- cobro mientras se marca cuenta por cuenta.

alter table public.contacts
  add column if not exists cobranza_recipient boolean not null default false;

comment on column public.contacts.cobranza_recipient is
  'true = este contacto recibe los correos de cobro (área administrativa de la cuenta).';

-- Índice parcial para resolver rápido "¿esta cuenta ya tiene contactos de cobranza?".
create index if not exists idx_contacts_cobranza
  on public.contacts (account_id)
  where cobranza_recipient;
