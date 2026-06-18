-- Reporte de fallas de vehículos (módulo Flota). Los CHOFERES reportan cuando un
-- auto necesita servicio, cambio de llanta, frenos, etc. Los vehículos viven en
-- Base44; aquí guardamos el reporte referenciando el id de Base44 + una etiqueta
-- legible (placas/modelo) por si el catálogo de Base44 no está disponible.

create table if not exists fleet_fault_reports (
  id uuid primary key default gen_random_uuid(),
  vehicle_id text,                          -- id del vehículo en Base44 (opcional)
  vehicle_label text not null,              -- snapshot legible, p.ej. "Nissan NP300 · ABC-12-34"
  fault_type text not null,
  description text not null,
  urgency text not null default 'media',    -- baja | media | alta
  km integer,
  status text not null default 'reportado', -- reportado | en_proceso | atendido | descartado
  resolution_notes text,
  resolved_at timestamptz,
  resolved_by uuid references sales_reps(id),
  reported_by uuid references sales_reps(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_fleet_faults_status on fleet_fault_reports (status, created_at desc);
create index if not exists idx_fleet_faults_vehicle on fleet_fault_reports (vehicle_id);

-- Helper: ¿el usuario es de logística (admin o jefe de logística)?
create or replace function public.is_fleet_manager()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.sales_reps
    where auth_user_id = auth.uid() and role in ('admin', 'jefe_logistica') and active = true
  );
$$;

alter table fleet_fault_reports enable row level security;

-- Lectura: logística ve todo; el chofer ve los que él reportó.
drop policy if exists fleet_faults_select on fleet_fault_reports;
create policy fleet_faults_select on fleet_fault_reports
  for select using (
    public.is_fleet_manager() or reported_by = public.current_rep_id()
  );

-- Alta: cualquier usuario autenticado reportando como sí mismo.
drop policy if exists fleet_faults_insert on fleet_fault_reports;
create policy fleet_faults_insert on fleet_fault_reports
  for insert with check (reported_by = public.current_rep_id());

-- Edición (estatus, cierre): solo logística.
drop policy if exists fleet_faults_update on fleet_fault_reports;
create policy fleet_faults_update on fleet_fault_reports
  for update using (public.is_fleet_manager()) with check (public.is_fleet_manager());

comment on table fleet_fault_reports is
  'Fallas de vehículos reportadas por choferes (servicio, llantas, frenos…). Vehículos en Base44.';
