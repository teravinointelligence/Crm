-- =====================================================================
-- Permisos de módulos por usuario
-- =====================================================================
-- `modules` = lista de módulos (keys) que el usuario puede ver en el sidebar.
-- null = usar los módulos por defecto de su rol (admin: todos; rep: estándar).
-- Solo aplica a no-admin; un admin siempre ve todo.
-- =====================================================================

alter table public.sales_reps
  add column if not exists modules text[];
