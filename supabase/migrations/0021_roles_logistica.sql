-- =====================================================================
-- Roles adicionales: chofer y jefe de logística
-- =====================================================================
-- Amplía el CHECK de sales_reps.role para incluir roles operativos de reparto.
-- Ambos son no-admin (is_admin() sigue siendo solo 'admin'); su visibilidad se
-- controla por módulos como cualquier no-admin.
-- =====================================================================

alter table public.sales_reps drop constraint if exists sales_reps_role_check;
alter table public.sales_reps
  add constraint sales_reps_role_check
  check (role in ('admin', 'rep', 'chofer', 'jefe_logistica'));
