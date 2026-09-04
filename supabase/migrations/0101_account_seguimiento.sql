-- Panel de seguimiento de la cuenta: notas y periodos en que no puede comprar.
--
-- Hasta ahora el seguimiento de una cuenta eran citas (activities) y visitas de
-- proveedor. Todo lo demás que el vendedor sabe del cliente —"el chef nuevo
-- entra en septiembre", "de mayo a octubre corporativo no les autoriza compras",
-- "piden factura a nombre de la matriz"— no tenía dónde vivir: o se inventaba
-- una actividad, o se perdía.
--
-- Esta migración agrega dos cosas al panel:
--   1. account_notes           — bitácora de notas de la cuenta (del equipo, no
--                                personales como rep_notes).
--   2. account_purchase_blocks — periodos en que la cuenta NO puede comprar
--                                (temporada baja, remodelación, crédito
--                                suspendido). Silencian las alertas de churn:
--                                regañar a un vendedor porque el hotel no
--                                factura en temporada baja es ruido.
--
-- Y abre una regla más en las tareas del vendedor: `sin_facturar`, la alerta de
-- "esta cuenta lleva un mes sin facturar".

-- ---------------------------------------------------------------------
-- 1. Notas de la cuenta
-- ---------------------------------------------------------------------
-- Distinta de rep_notes: aquella es la libreta personal del vendedor (solo él
-- la ve, aunque etiquete cuentas). Esta cuelga de la cuenta, así que la ve
-- quien lleva la cuenta hoy — si mañana se reasigna, el historial viaja con
-- ella en vez de quedarse con el vendedor anterior.
create table if not exists public.account_notes (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  -- Autor. Nullable para no perder la nota si se da de baja al vendedor.
  sales_rep_id uuid references public.sales_reps(id) on delete set null,
  body text not null check (length(btrim(body)) > 0),
  -- Para qué sirve la nota. Ordena la lectura del panel; no cambia permisos.
  kind text not null default 'nota'
    check (kind in ('nota', 'acuerdo', 'preferencia', 'incidencia', 'temporada')),
  -- Fijar una nota la mantiene arriba: lo que hay que leer antes de visitar.
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists account_notes_account_idx
  on public.account_notes(account_id, pinned desc, created_at desc);

drop trigger if exists set_updated_at on public.account_notes;
create trigger set_updated_at before update on public.account_notes
  for each row execute function public.tg_set_updated_at();

-- ---------------------------------------------------------------------
-- 2. Periodos en que la cuenta no puede comprar
-- ---------------------------------------------------------------------
-- `end_date` nulo = sigue vigente sin fecha de término conocida (una
-- remodelación no siempre tiene fecha). Se cierra poniéndole fecha, no
-- borrando la fila: el histórico explica por qué la cuenta no facturó.
create table if not exists public.account_purchase_blocks (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  reason text not null check (reason in (
    'temporada_baja', 'remodelacion', 'cambio_administracion',
    'credito_suspendido', 'cierre_temporal', 'otro'
  )),
  note text,
  start_date date not null default current_date,
  end_date date,
  created_by uuid references public.sales_reps(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint account_purchase_blocks_dates
    check (end_date is null or end_date >= start_date)
);

create index if not exists account_purchase_blocks_account_idx
  on public.account_purchase_blocks(account_id, start_date desc);

-- El cron pregunta "¿qué cuentas están bloqueadas hoy?" sobre todo el universo:
-- este índice le evita el seq scan de la tabla completa.
create index if not exists account_purchase_blocks_open_idx
  on public.account_purchase_blocks(account_id)
  where end_date is null;

drop trigger if exists set_updated_at on public.account_purchase_blocks;
create trigger set_updated_at before update on public.account_purchase_blocks
  for each row execute function public.tg_set_updated_at();

-- ---------------------------------------------------------------------
-- 3. Nueva regla de tareas: cuenta sin facturar en un mes
-- ---------------------------------------------------------------------
alter table public.rep_tasks drop constraint if exists rep_tasks_source_check;
alter table public.rep_tasks add constraint rep_tasks_source_check
  check (source in ('prospecto', 'cobranza', 'inactivo', 'sin_facturar', 'manual'));

-- ---------------------------------------------------------------------
-- 4. RLS — ambas tablas heredan el alcance de la cuenta.
--
-- Leer/escribir sigue la misma regla que `accounts`: admin ve todo, el vendedor
-- solo lo suyo. El contador también lee, como en account_proposals, porque
-- cobranza necesita saber si el cliente está en pausa antes de insistir.
-- ---------------------------------------------------------------------
alter table public.account_notes enable row level security;
alter table public.account_purchase_blocks enable row level security;

-- can_read_all() ya existe desde 0024: admin o contador. Aquí solo se le suma
-- el vendedor asignado a ESA cuenta.
create or replace function public.can_read_account(a_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.can_read_all() or exists (
    select 1 from public.accounts a
    where a.id = a_id and a.assigned_rep_id = public.current_rep_id()
  );
$$;

create or replace function public.can_write_account(a_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (
    select 1 from public.accounts a
    where a.id = a_id and a.assigned_rep_id = public.current_rep_id()
  );
$$;

drop policy if exists account_notes_select on public.account_notes;
create policy account_notes_select on public.account_notes
  for select using (public.can_read_account(account_id));

drop policy if exists account_notes_insert on public.account_notes;
create policy account_notes_insert on public.account_notes
  for insert with check (public.can_write_account(account_id));

-- Editar/borrar: admin, o el autor de la nota mientras siga llevando la cuenta.
-- Que el vendedor entrante no pueda reescribir la bitácora del anterior es a
-- propósito: la nota es evidencia de lo que se dijo, no un documento vivo.
drop policy if exists account_notes_update on public.account_notes;
create policy account_notes_update on public.account_notes
  for update using (
    public.is_admin()
    or (sales_rep_id = public.current_rep_id() and public.can_write_account(account_id))
  ) with check (
    public.is_admin()
    or (sales_rep_id = public.current_rep_id() and public.can_write_account(account_id))
  );

drop policy if exists account_notes_delete on public.account_notes;
create policy account_notes_delete on public.account_notes
  for delete using (
    public.is_admin()
    or (sales_rep_id = public.current_rep_id() and public.can_write_account(account_id))
  );

-- Los bloqueos sí los administra quien lleva la cuenta (no solo quien los
-- capturó): si el vendedor cambia, el nuevo tiene que poder cerrar la pausa.
drop policy if exists account_purchase_blocks_select on public.account_purchase_blocks;
create policy account_purchase_blocks_select on public.account_purchase_blocks
  for select using (public.can_read_account(account_id));

drop policy if exists account_purchase_blocks_write on public.account_purchase_blocks;
create policy account_purchase_blocks_write on public.account_purchase_blocks
  for all using (public.can_write_account(account_id))
  with check (public.can_write_account(account_id));
