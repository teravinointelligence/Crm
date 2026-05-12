-- Documentos de tránsito: la OC que genera TERAVINO (Excel) y la factura del proveedor (PDF)
alter table public.purchase_orders
  add column if not exists oc_file_url text;

-- Bucket privado para estos documentos
insert into storage.buckets (id, name, public)
values ('documentos', 'documentos', false)
on conflict (id) do nothing;

-- Solo admins (Sabrina) suben/leen documentos de proveedores (contienen costos)
drop policy if exists documentos_admin_select on storage.objects;
create policy documentos_admin_select on storage.objects
  for select to authenticated
  using (bucket_id = 'documentos' and public.is_admin());

drop policy if exists documentos_admin_insert on storage.objects;
create policy documentos_admin_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'documentos' and public.is_admin());

drop policy if exists documentos_admin_update on storage.objects;
create policy documentos_admin_update on storage.objects
  for update to authenticated
  using (bucket_id = 'documentos' and public.is_admin())
  with check (bucket_id = 'documentos' and public.is_admin());

drop policy if exists documentos_admin_delete on storage.objects;
create policy documentos_admin_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'documentos' and public.is_admin());
