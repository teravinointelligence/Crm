-- Reasignación automática de cuentas por inactividad.
-- Cuando una cuenta asignada lleva >= 50 días sin actividad, se manda al vendedor
-- un aviso ("te quedan 10 días"); si pasados ~10 días sigue sin actividad, la
-- cuenta se regresa al pool (assigned_rep_id = null) para que admin la reparta.
-- El barrido vive en lib/reasignacion-inactivas.ts y corre por cron (diario).

-- Marca de cuándo se mandó el aviso de reasignación. null = sin aviso pendiente.
-- El aviso siempre precede a la reasignación: la cuenta no se reasigna sin que
-- antes se haya seteado esta marca y haya transcurrido el margen de gracia.
alter table public.accounts
  add column if not exists reassign_warned_at timestamptz;

-- Ancla del "reloj de inactividad" para cuentas que aún no tienen actividad
-- registrada. Si la cuenta nunca tuvo actividad, la inactividad se mide desde
-- aquí (no desde created_at), para que las cuentas importadas sin historial no
-- se marquen todas el primer día. Default now() → cuentas nuevas arrancan al
-- crearse; el backfill da a las existentes un arranque parejo desde el deploy.
-- En cuanto se registra una actividad, esa fecha manda sobre este baseline.
alter table public.accounts
  add column if not exists activity_baseline_at timestamptz not null default now();

-- Bitácora de reasignaciones por inactividad (a quién se le quitó la cuenta).
create table if not exists public.account_reassignment_log (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references public.accounts(id) on delete cascade,
  from_rep_id uuid references public.sales_reps(id) on delete set null,
  to_rep_id   uuid references public.sales_reps(id) on delete set null,
  reason      text,
  created_at  timestamptz not null default now()
);

create index if not exists idx_reassignment_log_account on public.account_reassignment_log(account_id);
create index if not exists idx_reassignment_log_created on public.account_reassignment_log(created_at desc);

alter table public.account_reassignment_log enable row level security;

-- Solo admin lee la bitácora desde la app. Las escrituras vienen del service-role
-- (cron / endpoint admin), que se salta el RLS.
drop policy if exists reassignment_log_select on public.account_reassignment_log;
create policy reassignment_log_select on public.account_reassignment_log
  for select using (public.is_admin());
