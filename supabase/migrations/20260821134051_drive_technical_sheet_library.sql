-- ---------------------------------------------------------------------
-- Biblioteca maestra de fichas técnicas en Google Drive
--
-- Drive conserva el archivo maestro. Estas columnas guardan la relación y
-- el estado de la última copia sincronizada al bucket privado del CRM.
-- La API de administración usa service_role después de validar al admin.
-- ---------------------------------------------------------------------

alter table public.products
  add column if not exists technical_sheet_drive_file_id text,
  add column if not exists technical_sheet_drive_file_name text,
  add column if not exists technical_sheet_drive_url text,
  add column if not exists technical_sheet_drive_modified_at timestamptz,
  add column if not exists technical_sheet_drive_md5 text,
  add column if not exists technical_sheet_drive_synced_at timestamptz,
  add column if not exists technical_sheet_drive_sync_error text;

create unique index if not exists products_technical_sheet_drive_file_id_key
  on public.products (technical_sheet_drive_file_id)
  where technical_sheet_drive_file_id is not null;

comment on column public.products.technical_sheet_drive_file_id is
  'ID del PDF maestro en la carpeta Fichas Técnicas TERAVINO de Google Drive.';
comment on column public.products.technical_sheet_drive_synced_at is
  'Última fecha en que el PDF de Drive se copió al bucket privado del CRM.';
comment on column public.products.technical_sheet_drive_sync_error is
  'Último error de sincronización con Drive; null cuando la copia está al día.';
