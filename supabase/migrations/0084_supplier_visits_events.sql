-- =====================================================================
-- 0084: Visitas de proveedor + Eventos (port de "Teravino Events")
-- =====================================================================
-- Trae al CRM las dos capas de la app aparte "Teravino Events":
--   (1) Visitas de proveedor (supplier_visits) con su agenda día a día
--       (visit_activities + contactos/vinos/staff por actividad).
--   (2) Eventos formales (events) tipo cena maridaje / lunch / lanzamiento
--       con invitados+RSVP (event_guests), vinos del maridaje, staff,
--       checklist de producción y archivos/flyer.
-- Todo se INTEGRA con los datos del CRM: coordinador/staff -> sales_reps,
-- cliente/invitado -> accounts/contacts (con respaldo de texto libre).
-- Acceso: admin crea visitas/eventos; los vendedores ven todo y AGENDAN
-- actividades / invitan a sus clientes (RLS abajo).
-- Helpers reutilizados: public.is_admin(), public.current_rep_id().
-- =====================================================================

-- ---------------------------------------------------------------------
-- Capa 1: Visitas de proveedor
-- ---------------------------------------------------------------------
create table if not exists public.supplier_visits (
  id             uuid primary key default gen_random_uuid(),
  provider_name  text not null,
  winery_brand   text,
  arrival_date   date not null,
  departure_date date not null,
  city           text not null,
  coordinator_id uuid references public.sales_reps(id) on delete set null,
  status         text not null default 'planning'
                   check (status in ('planning','confirmed','in_progress','completed','cancelled')),
  notes          text,
  created_by     uuid references public.sales_reps(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- NOTE: events se crea más abajo; visit_activities.event_id se referencia con
-- un ALTER al final para no depender del orden de creación.
create table if not exists public.visit_activities (
  id            uuid primary key default gen_random_uuid(),
  visit_id      uuid not null references public.supplier_visits(id) on delete cascade,
  event_id      uuid,
  day_date      date not null,
  start_time    time,
  end_time      time,
  activity_type text not null default 'otro'
                  check (activity_type in ('comida','cena','presentacion','capacitacion','reunion','traslado','otro')),
  title         text not null,
  account_id    uuid references public.accounts(id) on delete set null,
  client_name   text,
  location      text,
  city          text,
  status        text not null default 'pending'
                  check (status in ('pending','confirmed','cancelled')),
  notes         text,
  sort_order    int not null default 0,
  created_by    uuid references public.sales_reps(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists public.visit_activity_contacts (
  id          uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.visit_activities(id) on delete cascade,
  contact_id  uuid not null references public.contacts(id) on delete cascade,
  notes       text
);

create table if not exists public.visit_activity_wines (
  id           uuid primary key default gen_random_uuid(),
  activity_id  uuid not null references public.visit_activities(id) on delete cascade,
  product_id   uuid references public.products(id) on delete set null,
  wine_name    text not null,
  winery       text,
  vintage      text,
  bottle_count int not null default 1,
  notes        text
);

create table if not exists public.visit_activity_staff (
  id               uuid primary key default gen_random_uuid(),
  activity_id      uuid not null references public.visit_activities(id) on delete cascade,
  sales_rep_id     uuid not null references public.sales_reps(id) on delete cascade,
  role_in_activity text
);

-- ---------------------------------------------------------------------
-- Capa 2: Eventos formales
-- ---------------------------------------------------------------------
create table if not exists public.events (
  id                     uuid primary key default gen_random_uuid(),
  name                   text not null,
  event_type             text not null
                           check (event_type in ('winemaker_dinner','winemaker_lunch','new_wine_launch',
                                                  'private_event','cena_maridaje','lunch_maridaje',
                                                  'winery_visit','training','festival_public','tbc')),
  description            text,
  start_date             timestamptz not null,
  end_date               timestamptz not null,
  venue_name             text,
  venue_address          text,
  venue_map_url          text,
  venue_contact          text,
  city                   text not null,
  winery_brand           text,
  coordinator_id         uuid references public.sales_reps(id) on delete set null,
  visit_id               uuid references public.supplier_visits(id) on delete set null,
  max_capacity           int,
  confirmation_deadline  timestamptz,
  status                 text not null default 'upcoming'
                           check (status in ('upcoming','confirmed','completed','cancelled','postponed','tbc')),
  budget_estimated       numeric,
  dress_code_staff       text,
  staff_arrival_time     timestamptz,
  notes                  text,
  flyer_url              text,
  invitation_slug        text unique,
  deadline_reminder_sent boolean not null default false,
  event_reminder_sent    boolean not null default false,
  created_by             uuid references public.sales_reps(id) on delete set null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

-- Ahora que events existe, enlaza visit_activities.event_id.
do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where constraint_name = 'visit_activities_event_id_fkey'
      and table_name = 'visit_activities'
  ) then
    alter table public.visit_activities
      add constraint visit_activities_event_id_fkey
      foreign key (event_id) references public.events(id) on delete set null;
  end if;
end$$;

create table if not exists public.event_guests (
  id                  uuid primary key default gen_random_uuid(),
  event_id            uuid not null references public.events(id) on delete cascade,
  account_id          uuid references public.accounts(id) on delete set null,
  contact_id          uuid references public.contacts(id) on delete set null,
  guest_name          text,
  guest_email         text,
  invitation_status   text not null default 'to_send'
                        check (invitation_status in ('to_send','sent','change_notified')),
  confirmation_status text not null default 'pending'
                        check (confirmation_status in ('pending','accepted','declined','reconfirmed',
                                                       'last_minute_cancel','expired','waitlist')),
  invited_by          uuid references public.sales_reps(id) on delete set null,
  invitation_sent_at  timestamptz,
  response_at         timestamptz,
  checked_in          boolean not null default false,
  checked_in_at       timestamptz,
  decline_reason      text,
  dietary_notes       text,
  notes               text,
  rsvp_token          text unique,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table if not exists public.event_wines (
  id                  uuid primary key default gen_random_uuid(),
  event_id            uuid not null references public.events(id) on delete cascade,
  product_id          uuid references public.products(id) on delete set null,
  wine_name           text not null,
  winery              text,
  vintage             text,
  bottle_count        int not null default 1,
  serving_temperature text,
  recommended_glass   text,
  pairing_order       int,
  notes               text
);

create table if not exists public.event_staff (
  id            uuid primary key default gen_random_uuid(),
  event_id      uuid not null references public.events(id) on delete cascade,
  sales_rep_id  uuid not null references public.sales_reps(id) on delete cascade,
  role_in_event text,
  notes         text
);

create table if not exists public.event_checklist (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references public.events(id) on delete cascade,
  item        text not null,
  is_ready    boolean not null default false,
  assigned_to uuid references public.sales_reps(id) on delete set null,
  notes       text,
  sort_order  int not null default 0
);

create table if not exists public.event_files (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references public.events(id) on delete cascade,
  file_url    text not null,
  storage_path text,
  file_name   text,
  file_type   text check (file_type in ('photo','flyer','sop_pdf','report','other')),
  uploaded_by uuid references public.sales_reps(id) on delete set null,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Índices
-- ---------------------------------------------------------------------
create index if not exists idx_supplier_visits_arrival on public.supplier_visits (arrival_date desc);
create index if not exists idx_supplier_visits_status on public.supplier_visits (status);
create index if not exists idx_visit_activities_visit on public.visit_activities (visit_id, day_date, sort_order);
create index if not exists idx_visit_activities_account on public.visit_activities (account_id);
create index if not exists idx_visit_activities_day on public.visit_activities (day_date);
create index if not exists idx_visit_activity_contacts_activity on public.visit_activity_contacts (activity_id);
create index if not exists idx_visit_activity_wines_activity on public.visit_activity_wines (activity_id);
create index if not exists idx_visit_activity_staff_activity on public.visit_activity_staff (activity_id);
create index if not exists idx_events_start on public.events (start_date desc);
create index if not exists idx_events_status on public.events (status);
create index if not exists idx_events_visit on public.events (visit_id);
create index if not exists idx_event_guests_event on public.event_guests (event_id);
create index if not exists idx_event_guests_account on public.event_guests (account_id);
create index if not exists idx_event_wines_event on public.event_wines (event_id);
create index if not exists idx_event_staff_event on public.event_staff (event_id);
create index if not exists idx_event_checklist_event on public.event_checklist (event_id, sort_order);
create index if not exists idx_event_files_event on public.event_files (event_id);

-- ---------------------------------------------------------------------
-- RLS
-- Lectura: todo el equipo autenticado (vendedores ven el calendario completo).
-- Escritura:
--   * supplier_visits / events / event_wines / event_staff / event_checklist /
--     event_files -> solo admin (producción la lleva dirección).
--   * visit_activities (+ sub-tablas) y event_guests -> cualquier vendedor
--     (agendan actividades / invitan). Borrado restringido a admin o autor.
-- La página pública de RSVP usa service-role (bypassa RLS) validando rsvp_token.
-- ---------------------------------------------------------------------

-- helper local de lectura: usuario del CRM autenticado
-- (inline en cada policy para no crear funciones nuevas)

-- supplier_visits: read all, write admin
alter table public.supplier_visits enable row level security;
drop policy if exists supplier_visits_select on public.supplier_visits;
create policy supplier_visits_select on public.supplier_visits
  for select using (exists (select 1 from public.sales_reps where auth_user_id = auth.uid()));
drop policy if exists supplier_visits_admin_write on public.supplier_visits;
create policy supplier_visits_admin_write on public.supplier_visits
  for all using (public.is_admin()) with check (public.is_admin());

-- visit_activities: read all, write any rep, delete admin/author
alter table public.visit_activities enable row level security;
drop policy if exists visit_activities_select on public.visit_activities;
create policy visit_activities_select on public.visit_activities
  for select using (exists (select 1 from public.sales_reps where auth_user_id = auth.uid()));
drop policy if exists visit_activities_insert on public.visit_activities;
create policy visit_activities_insert on public.visit_activities
  for insert with check (public.current_rep_id() is not null);
drop policy if exists visit_activities_update on public.visit_activities;
create policy visit_activities_update on public.visit_activities
  for update using (public.current_rep_id() is not null) with check (public.current_rep_id() is not null);
drop policy if exists visit_activities_delete on public.visit_activities;
create policy visit_activities_delete on public.visit_activities
  for delete using (public.is_admin() or created_by = public.current_rep_id());

-- sub-tablas de actividad: read all, write any rep (la actividad ya filtra acceso)
do $$
declare t text;
begin
  foreach t in array array['visit_activity_contacts','visit_activity_wines','visit_activity_staff'] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists %I on public.%I;', t||'_select', t);
    execute format($q$create policy %I on public.%I for select using (exists (select 1 from public.sales_reps where auth_user_id = auth.uid()));$q$, t||'_select', t);
    execute format('drop policy if exists %I on public.%I;', t||'_write', t);
    execute format($q$create policy %I on public.%I for all using (public.current_rep_id() is not null) with check (public.current_rep_id() is not null);$q$, t||'_write', t);
  end loop;
end$$;

-- events: read all, write admin
alter table public.events enable row level security;
drop policy if exists events_select on public.events;
create policy events_select on public.events
  for select using (exists (select 1 from public.sales_reps where auth_user_id = auth.uid()));
drop policy if exists events_admin_write on public.events;
create policy events_admin_write on public.events
  for all using (public.is_admin()) with check (public.is_admin());

-- event_guests: read all, write any rep, delete admin/inviter
alter table public.event_guests enable row level security;
drop policy if exists event_guests_select on public.event_guests;
create policy event_guests_select on public.event_guests
  for select using (exists (select 1 from public.sales_reps where auth_user_id = auth.uid()));
drop policy if exists event_guests_insert on public.event_guests;
create policy event_guests_insert on public.event_guests
  for insert with check (public.current_rep_id() is not null);
drop policy if exists event_guests_update on public.event_guests;
create policy event_guests_update on public.event_guests
  for update using (public.current_rep_id() is not null) with check (public.current_rep_id() is not null);
drop policy if exists event_guests_delete on public.event_guests;
create policy event_guests_delete on public.event_guests
  for delete using (public.is_admin() or invited_by = public.current_rep_id());

-- event_wines / event_staff / event_checklist / event_files: read all, write admin
do $$
declare t text;
begin
  foreach t in array array['event_wines','event_staff','event_checklist','event_files'] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists %I on public.%I;', t||'_select', t);
    execute format($q$create policy %I on public.%I for select using (exists (select 1 from public.sales_reps where auth_user_id = auth.uid()));$q$, t||'_select', t);
    execute format('drop policy if exists %I on public.%I;', t||'_admin_write', t);
    execute format($q$create policy %I on public.%I for all using (public.is_admin()) with check (public.is_admin());$q$, t||'_admin_write', t);
  end loop;
end$$;

-- ---------------------------------------------------------------------
-- Storage: bucket público `eventos` (flyer + archivos del evento).
-- Mismo patrón que `portafolios` (mig 0056): lectura abierta, escritura admin.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
  values ('eventos', 'eventos', true)
  on conflict (id) do nothing;

drop policy if exists eventos_obj_select on storage.objects;
create policy eventos_obj_select on storage.objects
  for select using (bucket_id = 'eventos');

drop policy if exists eventos_obj_write on storage.objects;
create policy eventos_obj_write on storage.objects
  for all
  using (bucket_id = 'eventos' and public.is_admin())
  with check (bucket_id = 'eventos' and public.is_admin());

-- ---------------------------------------------------------------------
-- updated_at automático (trigger compartido si existe, si no lo creamos).
-- ---------------------------------------------------------------------
create or replace function public.tg_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end$$;

do $$
declare t text;
begin
  foreach t in array array['supplier_visits','visit_activities','events','event_guests'] loop
    execute format('drop trigger if exists tg_%s_updated_at on public.%I;', t, t);
    execute format('create trigger tg_%s_updated_at before update on public.%I for each row execute function public.tg_touch_updated_at();', t, t);
  end loop;
end$$;

-- ---------------------------------------------------------------------
-- Seed de arranque (idempotente: solo si supplier_visits está vacía).
-- Réplica de los datos reales del proyecto teravino-events para que el
-- módulo no nazca vacío. Cliente como texto libre (sin mapear FKs).
-- ---------------------------------------------------------------------
do $$
declare v_vernazza uuid;
begin
  if not exists (select 1 from public.supplier_visits) then
    insert into public.supplier_visits (provider_name, winery_brand, arrival_date, departure_date, city, status) values
      ('Vernazza','Gerard Bertrand','2026-03-08','2026-03-10','Los Cabos','completed')
      returning id into v_vernazza;
    insert into public.supplier_visits (provider_name, winery_brand, arrival_date, departure_date, city, status) values
      ('Bruma','Bruma','2026-03-13','2026-03-15','Los Cabos','completed'),
      ('Vernazza','Gerard Bertrand','2026-04-13','2026-04-17','Los Cabos','completed'),
      ('Lulu Martínez','Bruma','2026-05-01','2026-05-04','Los Cabos','planning');

    insert into public.visit_activities (visit_id, day_date, start_time, activity_type, title, client_name, city, status) values
      (v_vernazza,'2026-03-08','14:00','comida','Sur Beach Club','Sur Beach Club','Los Cabos','confirmed'),
      (v_vernazza,'2026-03-08','18:00','cena','Cena en Restaurante El Comal','Hotel Chileno Bay','Los Cabos','confirmed'),
      (v_vernazza,'2026-03-09','15:00','reunion','Visita a Carbon Cabron','Carbon Cabron','Los Cabos','confirmed');
  end if;

  if not exists (select 1 from public.events) then
    insert into public.events (name, event_type, start_date, end_date, city, winery_brand, status) values
      ('Lanzamiento Bruma La Reserva con Lulu Martínez','new_wine_launch','2026-03-13 20:00:00+00','2026-03-13 23:00:00+00','Los Cabos','Bruma','confirmed'),
      ('Visita Gerard Bertrand / Vernazza','winery_visit','2026-04-13 16:00:00+00','2026-04-13 20:00:00+00','Los Cabos','Gerard Bertrand','confirmed'),
      ('Baja Best Amigos Invisibles','festival_public','2026-05-02 21:00:00+00','2026-05-03 01:00:00+00','Todos Santos','JFW','confirmed');
  end if;
end$$;
