-- =====================================================================
-- PRESENCIA DEL EQUIPO ("quién está usando la app")
-- =====================================================================
-- Cada usuario marca su "última conexión" con un heartbeat mientras tiene la
-- app abierta. La pantalla Equipo muestra en verde a quien estuvo activo en
-- los últimos minutos. sales_reps ya es legible por cualquier usuario
-- autenticado (política sales_reps_select), así que la pantalla puede leer
-- last_seen_at de todos.
-- =====================================================================

alter table public.sales_reps add column if not exists last_seen_at timestamptz;

-- Heartbeat: cada quien actualiza SU propia última conexión. SECURITY DEFINER
-- para no abrir la escritura general de sales_reps (que es admin-only); solo
-- toca la fila del usuario actual y solo esta columna.
create or replace function public.touch_presence()
returns void
language sql
security definer
set search_path = public
as $$
  update public.sales_reps
     set last_seen_at = now()
   where auth_user_id = auth.uid();
$$;

grant execute on function public.touch_presence() to authenticated;
