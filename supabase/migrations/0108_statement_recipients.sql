-- Destinatarios configurables para estados de cuenta.
--
-- Se conservan los envíos actuales marcando inicialmente todos los contactos
-- que ya tienen correo. A partir de aquí cada cuenta puede activar o desactivar
-- destinatarios desde su pestaña de Contactos.

do $$
begin
  -- El backfill solo corre cuando la columna nace. Esto hace segura la
  -- migración en producción si el esquema se preparó previamente.
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'contacts'
      and column_name = 'receives_statement'
  ) then
    alter table public.contacts
      add column receives_statement boolean not null default false;

    update public.contacts
    set receives_statement = true
    where nullif(btrim(email), '') is not null;
  end if;
end
$$;

comment on column public.contacts.receives_statement is
  'Indica si el contacto recibe los estados de cuenta y recordatorios de pago de su cuenta.';
