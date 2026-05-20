-- =====================================================================
-- SOPs / Manuales de operación (solo lectura, embebidos de Google Drive)
-- =====================================================================
-- Cada fila apunta a un archivo de Google Drive. La vista en el CRM embebe el
-- preview de Drive (sin descarga; la descarga se controla en los permisos del
-- archivo en Drive). No se guarda el contenido, solo el id del archivo.
-- =====================================================================

create table if not exists public.sops (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text,
  drive_file_id text not null unique,
  file_kind text default 'pdf',   -- 'pdf' | 'doc' (para el ícono)
  sort_order int default 0,
  active boolean default true,
  created_at timestamptz default now()
);

alter table public.sops enable row level security;

-- Lectura: cualquier usuario autenticado del CRM.
drop policy if exists sops_select on public.sops;
create policy sops_select on public.sops
  for select using (auth.uid() is not null);

-- Escritura: solo admin (dar de alta / ocultar manuales).
drop policy if exists sops_admin_write on public.sops;
create policy sops_admin_write on public.sops
  for all using (public.is_admin()) with check (public.is_admin());

-- Seed con los manuales del folder de Drive de TERAVINO.
insert into public.sops (title, category, drive_file_id, file_kind, sort_order) values
  ('SOP 01 · Ventas', 'Ventas', '1Q1Kni13kd9AIhpJsz3o2T01L8qgIPYki', 'pdf', 1),
  ('SOP 02 · Pedidos y entregas', 'Pedidos', '1M9aGL3ti1mDCxJ-cxh05Ter2bFx0MqyB', 'pdf', 2),
  ('SOP 03 · Cobro de cartera', 'Cartera', '1iboKPum9bR-n7xKvhbZxSbiCbtlUschr', 'pdf', 3),
  ('SOP 04 · Incorporación de clientes', 'Clientes', '1NUBpjMGqCyl_I60GttnPqlVn6DumKWbL', 'pdf', 4),
  ('SOP 05 · Gestión de portafolio', 'Portafolio', '1ZOvVM2NgFm0mhoqdYOJRMZ-MJeMyep7K', 'pdf', 5),
  ('SOP 06 · Reporteo de comisiones', 'Comisiones', '17cCxpStJdKnCIvTqj2CaAt1wxNOGJCu2', 'pdf', 6),
  ('SOP CHO · Choferes', 'Reparto', '1rk2Ow2wvi1xk_mPruz5NBpEF_BSJS2UK', 'pdf', 7),
  ('SOP CON-07 · Consignaciones', 'Consignaciones', '1EahGgslZJUQvXuZx3dSVGXnmFafwUEyU', 'pdf', 8),
  ('SOP CON-08 · Retiro de producto en consignación', 'Consignaciones', '1agYt5P1ZiOxUAtvdOWul74sDNsWSH8SU', 'pdf', 9),
  ('SOP FAC · Facturación CONTPAQi', 'Facturación', '13C4u726r-V64-PztDpJacFNpkS4npP_J', 'pdf', 10),
  ('SOP ALT · Alta de cliente CONTPAQi', 'Clientes', '1GwSpOCGDM4x0lmUlUGn_GaZ3_mOmb1GY', 'pdf', 11),
  ('SOP CAN · Cancelación de facturas', 'Facturación', '1AsBj-YYzXetHBD465yk9mOw9disZVufT', 'pdf', 12),
  ('Guía · Cómo hacer una factura en CONTPAQ', 'Facturación', '13x3zhUgBLqdoaWuxlM5JD_Yjx3nbtSS9', 'doc', 13),
  ('Guía · Cómo dar de alta un cliente en CONTPAQ', 'Clientes', '1kCFWX54IP7_FTy4IYheDz0Mdaiscfu8u', 'doc', 14),
  ('Guía · Cancelación de factura (CONTPAQ)', 'Facturación', '1SxxMvpQD2vJPVB5oGtZSSUyfOKIJDqtB', 'doc', 15)
on conflict (drive_file_id) do nothing;
