-- ---------------------------------------------------------------------
-- Fichas técnicas de producto
-- Un PDF vigente por producto. El admin lo administra desde Catálogo y
-- los vendedores lo descargan individualmente o en paquete desde Muestras.
-- ---------------------------------------------------------------------

alter table public.products
  add column if not exists technical_sheet_path text,
  add column if not exists technical_sheet_file_name text,
  add column if not exists technical_sheet_updated_at timestamptz,
  add column if not exists technical_sheet_updated_by uuid
    references public.sales_reps(id) on delete set null;

comment on column public.products.technical_sheet_path is
  'Ruta privada del PDF vigente dentro del bucket fichas-tecnicas.';

-- Bucket privado: las fichas solo se descargan mediante endpoints del CRM que
-- comprueban la sesión y los permisos de cada usuario.
insert into storage.buckets (id, name, public)
  values ('fichas-tecnicas', 'fichas-tecnicas', false)
  on conflict (id) do update set public = excluded.public;

-- Defensa en profundidad para cualquier uso futuro del cliente autenticado.
-- La API actual usa service_role después de validar el rol del usuario.
drop policy if exists fichas_tecnicas_obj_admin on storage.objects;
create policy fichas_tecnicas_obj_admin on storage.objects
  for all
  using (bucket_id = 'fichas-tecnicas' and public.is_admin())
  with check (bucket_id = 'fichas-tecnicas' and public.is_admin());
