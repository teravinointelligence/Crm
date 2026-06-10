-- =====================================================================
-- Academy — formación del equipo sobre el portafolio de vinos
-- =====================================================================
-- Módulo de capacitación: el equipo ESTUDIA el catálogo de vinos y hace
-- QUIZZES para aprenderlo. Los resultados se guardan por usuario (sales_reps)
-- para medir avance y armar un ranking.
--
-- Origen de datos: el catálogo `academy_wines` se siembra (0048_academy_seed)
-- desde la app de Base44 "Teravino Academy" (portafolio Los Cabos · Jun 2026).
-- A partir de aquí la Supabase del CRM es la fuente de verdad.
-- =====================================================================

-- ---------------------------------------------------------------------
-- ACADEMY_WINES — catálogo de estudio (contenido compartido para todos)
-- ---------------------------------------------------------------------
create table if not exists public.academy_wines (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  producer text,
  region text,
  country text,
  type text check (type in ('Tinto','Blanco','Rosado','Espumoso','Dulce','Fortificado')),
  grape_varieties text[],
  vintage text,
  price numeric(12,2),                 -- precio c/IVA de referencia
  alcohol_content numeric(5,2),
  tasting_notes text,                  -- en el origen trae precios/presentación
  pairing text,
  aging text,
  serving_temperature text,
  image_url text,
  location text,
  base44_id text unique,               -- procedencia (id en la app Base44)
  active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_academy_wines_type on public.academy_wines(type);
create index if not exists idx_academy_wines_country on public.academy_wines(country);
create index if not exists idx_academy_wines_producer on public.academy_wines(producer);

alter table public.academy_wines enable row level security;

-- Lectura: cualquier usuario autenticado (es material de estudio común).
drop policy if exists academy_wines_select on public.academy_wines;
create policy academy_wines_select on public.academy_wines
  for select using (auth.uid() is not null);
-- Escritura: solo admin (dirección curará el catálogo de estudio).
drop policy if exists academy_wines_admin_write on public.academy_wines;
create policy academy_wines_admin_write on public.academy_wines
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------
-- ACADEMY_QUIZ_RESULTS — resultado de cada quiz, ligado al vendedor
-- ---------------------------------------------------------------------
create table if not exists public.academy_quiz_results (
  id uuid primary key default gen_random_uuid(),
  rep_id uuid references public.sales_reps(id) on delete cascade not null,
  category text not null,              -- País, Tipo, Bodega, Región, Mixto…
  score numeric(5,2) not null,         -- % de aciertos (0-100)
  total_questions int not null,
  correct_answers int not null,
  time_spent_seconds int,
  streak int,                          -- mejor racha de aciertos seguidos
  created_at timestamptz default now()
);
create index if not exists idx_academy_quiz_results_rep on public.academy_quiz_results(rep_id);
create index if not exists idx_academy_quiz_results_category on public.academy_quiz_results(category);

alter table public.academy_quiz_results enable row level security;

-- Lectura: cualquier autenticado (para ver el ranking del equipo).
drop policy if exists academy_quiz_results_select on public.academy_quiz_results;
create policy academy_quiz_results_select on public.academy_quiz_results
  for select using (auth.uid() is not null);
-- Inserción: cada quien solo puede registrar SU propio resultado.
drop policy if exists academy_quiz_results_insert on public.academy_quiz_results;
create policy academy_quiz_results_insert on public.academy_quiz_results
  for insert with check (rep_id = public.current_rep_id());
-- Mantenimiento (update/delete): solo admin.
drop policy if exists academy_quiz_results_admin_write on public.academy_quiz_results;
create policy academy_quiz_results_admin_write on public.academy_quiz_results
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------
-- Ranking agregado por vendedor. security_invoker => respeta RLS (todos
-- pueden leer academy_quiz_results, así que todos ven el ranking completo).
-- ---------------------------------------------------------------------
create or replace view public.v_academy_leaderboard with (security_invoker = on) as
select
  r.rep_id,
  sr.full_name,
  sr.primary_region,
  count(*)                              as quizzes,
  round(avg(r.score))                   as avg_score,
  max(r.streak)                         as best_streak,
  sum(r.correct_answers)                as total_correct,
  max(r.created_at)                     as last_quiz_at
from public.academy_quiz_results r
join public.sales_reps sr on sr.id = r.rep_id
group by r.rep_id, sr.full_name, sr.primary_region;
grant select on public.v_academy_leaderboard to authenticated, anon;
