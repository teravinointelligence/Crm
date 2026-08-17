-- =====================================================================
-- 0098 — Trazabilidad del origen en Drive para las importaciones
-- =====================================================================
-- El cron /api/cron/inventarios-drive lee los cortes de inventario que el
-- equipo sube a Google Drive. Para no reprocesar el mismo archivo todos los
-- días necesita recordar QUÉ archivo importó y CON QUÉ fecha de modificación.
--
-- source_file_name ya existía, pero es un texto libre y se repite entre
-- cortes ("inventario tijuana 7 agosto.xls" vs "...8 agosto.xls"): no sirve
-- como llave. El id de Drive sí es estable y único.
--
-- Ambas columnas son opcionales: las importaciones manuales desde Catálogo
-- las dejan en null y siguen funcionando igual.
-- =====================================================================

alter table public.inventory_imports
  add column if not exists source_file_id text,
  add column if not exists source_modified_at timestamptz;

-- Búsqueda del cron: "¿ya importé este archivo con esta fecha?"
create index if not exists idx_inventory_imports_source_file
  on public.inventory_imports (source_file_id, source_modified_at desc)
  where source_file_id is not null;
