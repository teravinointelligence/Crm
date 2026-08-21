-- Enlace y estado del paquete de fichas técnicas creado en Google Drive al
-- aprobar una solicitud de muestras. Se guarda el error para permitir reintento
-- sin revertir la aprobación comercial.

alter table public.sample_requests
  add column if not exists technical_sheets_drive_file_id text,
  add column if not exists technical_sheets_drive_url text,
  add column if not exists technical_sheets_drive_created_at timestamptz,
  add column if not exists technical_sheets_drive_sent_at timestamptz,
  add column if not exists technical_sheets_drive_error text;

comment on column public.sample_requests.technical_sheets_drive_url is
  'Enlace al ZIP privado de fichas técnicas compartido con el vendedor.';
comment on column public.sample_requests.technical_sheets_drive_error is
  'Último error al preparar, compartir o enviar el enlace de Drive.';
