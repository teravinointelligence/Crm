-- ---------------------------------------------------------------------
-- Portafolios por zona (Tijuana, Vallarta, La Paz, Los Cabos)
-- Un PDF vigente por zona: subir uno nuevo REEMPLAZA al anterior. El admin
-- gestiona (sube/reemplaza/borra); todo usuario del CRM con el módulo lo ve
-- y descarga. El PDF vive en el bucket público `portafolios`.
-- ---------------------------------------------------------------------

create table if not exists public.portafolios (
  zona           text primary key,
  nombre_archivo text,
  pdf_url        text not null,
  storage_path   text not null,
  size_bytes     bigint,
  updated_by     uuid references public.sales_reps(id),
  updated_at     timestamptz not null default now(),
  constraint portafolios_zona_chk
    check (zona in ('tijuana', 'vallarta', 'la-paz', 'los-cabos'))
);

alter table public.portafolios enable row level security;

-- Lectura: cualquier usuario autenticado del CRM (la visibilidad fina la da el
-- módulo en el sidebar). Escritura: solo admin — además las API usan
-- service_role, así que esto es defensa en profundidad.
drop policy if exists portafolios_select on public.portafolios;
create policy portafolios_select on public.portafolios
  for select using (auth.uid() is not null);

drop policy if exists portafolios_admin_write on public.portafolios;
create policy portafolios_admin_write on public.portafolios
  for all using (public.is_admin()) with check (public.is_admin());

-- Bucket PÚBLICO: los portafolios se comparten con clientes, así que la URL
-- pública (getPublicUrl) es deseable. Ruta: <zona-slug>/<timestamp>.pdf
insert into storage.buckets (id, name, public)
  values ('portafolios', 'portafolios', true)
  on conflict (id) do nothing;

-- RLS de Storage: lectura abierta (bucket público); escritura solo admin.
drop policy if exists portafolios_obj_select on storage.objects;
create policy portafolios_obj_select on storage.objects
  for select using (bucket_id = 'portafolios');

drop policy if exists portafolios_obj_write on storage.objects;
create policy portafolios_obj_write on storage.objects
  for all
  using (bucket_id = 'portafolios' and public.is_admin())
  with check (bucket_id = 'portafolios' and public.is_admin());
