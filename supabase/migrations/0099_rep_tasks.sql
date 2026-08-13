-- Tareas del vendedor ("Mi día").
--
-- Hasta ahora la agenda solo tenía dos cosas: actividades (visitas/llamadas con
-- fecha) y el `next_step` de cada actividad. Faltaba lo que la dirección quiere
-- que el vendedor haga aunque él no lo haya capturado: seguir prospectos, cobrar
-- cartera vencida y rescatar clientes inactivos.
--
-- Esta tabla guarda esas tareas. Casi todas las genera solo el CRM (cron diario,
-- ver /api/cron/agenda-tareas) a partir de datos que ya existen; el admin también
-- puede asignar tareas a mano (source = 'manual').
--
-- Cerrar una tarea pide resultado + nota: así queda bitácora de qué pasó y se
-- puede medir el seguimiento, no solo el "ya le piqué a hecho".

create table if not exists public.rep_tasks (
  id uuid primary key default gen_random_uuid(),
  sales_rep_id uuid not null references public.sales_reps(id) on delete cascade,
  account_id uuid references public.accounts(id) on delete cascade,

  -- De dónde salió la tarea. Las tres primeras las genera el cron por reglas.
  source text not null check (source in ('prospecto', 'cobranza', 'inactivo', 'manual')),

  title text not null,
  -- El "por qué" en texto: vencido $X a N días, sin actividad hace N días, etc.
  detail text,
  due_date date not null,
  -- 0–100. Solo ordena la lista del día; mayor = primero.
  priority int not null default 0,

  status text not null default 'pendiente'
    check (status in ('pendiente', 'hecha', 'descartada', 'resuelta')),
  -- Resultado que captura el vendedor al cerrarla.
  outcome text check (outcome in (
    'contactado', 'no_contesto', 'agendo_cita', 'promesa_pago',
    'pago_recibido', 'sin_interes', 'no_aplica'
  )),
  result_note text,

  completed_at timestamptz,
  completed_by uuid references public.sales_reps(id) on delete set null,
  created_by uuid references public.sales_reps(id) on delete set null,

  -- Clave de deduplicación del generador: `<source>:<account_id>:<periodo>`.
  -- Evita que el cron cree la misma tarea todos los días y, al llevar periodo,
  -- permite que vuelva a salir el mes/semana siguiente si el problema sigue.
  dedupe_key text,
  -- Cifras del momento en que se generó (vencido, días sin actividad, …), para
  -- poder explicar la tarea sin volver a consultar todo.
  meta jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Una tarea cerrada debe traer cómo se cerró (el generador usa 'no_aplica').
  constraint rep_tasks_outcome_required
    check (status <> 'hecha' or outcome is not null)
);

-- Una sola tarea por regla+cuenta+periodo y vendedor. Sin WHERE: en Postgres
-- los NULL son distintos entre sí, así que las tareas manuales (dedupe_key
-- nulo) no chocan, y el índice sigue sirviendo para ON CONFLICT.
create unique index if not exists rep_tasks_dedupe_uidx
  on public.rep_tasks(sales_rep_id, dedupe_key);

-- La consulta de "Mi día": pendientes de un vendedor por fecha.
create index if not exists rep_tasks_pending_idx
  on public.rep_tasks(sales_rep_id, due_date)
  where status = 'pendiente';

create index if not exists rep_tasks_account_idx on public.rep_tasks(account_id);

drop trigger if exists set_updated_at on public.rep_tasks;
create trigger set_updated_at before update on public.rep_tasks
  for each row execute function public.tg_set_updated_at();

-- ---------------------------------------------------------------------
-- RLS: cada vendedor ve y cierra SOLO sus tareas; admin ve y asigna todas.
-- ---------------------------------------------------------------------
alter table public.rep_tasks enable row level security;

drop policy if exists rep_tasks_select on public.rep_tasks;
create policy rep_tasks_select on public.rep_tasks
  for select using (
    public.is_admin() or sales_rep_id = public.current_rep_id()
  );

-- Insertar a mano: solo admin (asignar a quien sea) o el propio vendedor para sí.
drop policy if exists rep_tasks_insert on public.rep_tasks;
create policy rep_tasks_insert on public.rep_tasks
  for insert with check (
    public.is_admin() or sales_rep_id = public.current_rep_id()
  );

-- El vendedor cierra/pospone las suyas; no puede pasárselas a otro.
drop policy if exists rep_tasks_update on public.rep_tasks;
create policy rep_tasks_update on public.rep_tasks
  for update using (
    public.is_admin() or sales_rep_id = public.current_rep_id()
  ) with check (
    public.is_admin() or sales_rep_id = public.current_rep_id()
  );

drop policy if exists rep_tasks_delete on public.rep_tasks;
create policy rep_tasks_delete on public.rep_tasks
  for delete using (public.is_admin());
