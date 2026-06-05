-- Evidencia (foto) del uso de la muestra en cada cita con el cliente.
-- Una foto por cita (sample_request_activities). Es opcional pero la UI marca
-- "falta evidencia" hasta que se sube; no bloquea el conteo de clientes.
alter table public.sample_request_activities add column if not exists evidence_path text;
alter table public.sample_request_activities add column if not exists evidence_uploaded_at timestamptz;

-- Bucket privado para las fotos de evidencia.
insert into storage.buckets (id, name, public)
  values ('evidencias', 'evidencias', false)
  on conflict (id) do nothing;

-- RLS de Storage: el vendedor sube/ve dentro de SU carpeta (primer folder = su
-- rep id); admin/contador ven todo. Ruta: <rep_id>/<request_id>/<activity_id>.
drop policy if exists evidencias_insert on storage.objects;
create policy evidencias_insert on storage.objects for insert with check (
  bucket_id = 'evidencias'
  and (public.is_admin() or (storage.foldername(name))[1] = public.current_rep_id()::text)
);
drop policy if exists evidencias_select on storage.objects;
create policy evidencias_select on storage.objects for select using (
  bucket_id = 'evidencias'
  and (public.can_read_all() or (storage.foldername(name))[1] = public.current_rep_id()::text)
);
drop policy if exists evidencias_update on storage.objects;
create policy evidencias_update on storage.objects for update using (
  bucket_id = 'evidencias'
  and (public.is_admin() or (storage.foldername(name))[1] = public.current_rep_id()::text)
) with check (
  bucket_id = 'evidencias'
  and (public.is_admin() or (storage.foldername(name))[1] = public.current_rep_id()::text)
);
drop policy if exists evidencias_delete on storage.objects;
create policy evidencias_delete on storage.objects for delete using (
  bucket_id = 'evidencias'
  and (public.is_admin() or (storage.foldername(name))[1] = public.current_rep_id()::text)
);
