-- Marca de "siguiente paso completado". Reutiliza el modelo de actividades:
-- cada actividad puede tener un next_step + next_step_date que ahora se puede
-- cerrar como tarea hecha, sin tabla nueva.
alter table public.activities
  add column if not exists next_step_done boolean not null default false;

-- Índice para la agenda de pendientes (siguientes pasos abiertos por fecha).
drop index if exists idx_activities_next_step;
create index if not exists idx_activities_pending_steps
  on public.activities(next_step_date)
  where next_step is not null and next_step_done = false;
