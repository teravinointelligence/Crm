-- =====================================================================
-- contacts.created_by — quién CAPTURÓ el contacto
-- =====================================================================
-- Hasta ahora la atribución de contactos por vendedor (p.ej. el monitor de
-- "Actividad del equipo") se hacía vía accounts.assigned_rep_id, es decir el
-- DUEÑO de la cuenta, no quien realmente lo dio de alta. Esta columna guarda al
-- rep que lo capturó.
--
-- Se llena con un DEFAULT = current_rep_id() para cubrir TODOS los puntos de
-- inserción (hoy solo ContactsList.tsx desde el cliente) sin tener que pasar el
-- id del rep por la UI. La función es security definer y resuelve auth.uid()
-- en el contexto de quien inserta. Las filas históricas quedan en NULL (el
-- consumidor cae a assigned_rep_id como respaldo).
-- =====================================================================

-- Se agrega SIN default primero para no reescribir/“backfillear” las filas
-- existentes (deben quedar NULL = histórico), y luego se fija el default para
-- los inserts nuevos.
alter table public.contacts
  add column if not exists created_by uuid references public.sales_reps(id) on delete set null;

alter table public.contacts
  alter column created_by set default public.current_rep_id();

create index if not exists idx_contacts_created_by on public.contacts(created_by);
