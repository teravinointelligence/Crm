-- Piloto de metas semanales de actividad comercial (7-sep a 4-oct-2026).
-- La meta vive en datos para que Dirección pueda ajustarla sin cambiar la
-- lógica del medidor y para conservar una referencia auditable por vendedor.

alter table public.activities
  add column if not exists completed_at timestamptz;

update public.activities
set completed_at = activity_date
where status = 'realizada' and completed_at is null;

create or replace function public.tg_set_activity_completed_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'realizada' then
    if tg_op = 'INSERT' or old.status is distinct from 'realizada' then
      new.completed_at := coalesce(new.completed_at, now());
    else
      new.completed_at := coalesce(new.completed_at, old.completed_at, new.activity_date);
    end if;
  else
    new.completed_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists set_activity_completed_at on public.activities;
create trigger set_activity_completed_at
before insert or update of status, completed_at on public.activities
for each row execute function public.tg_set_activity_completed_at();

create index if not exists idx_activities_rep_completed
  on public.activities (sales_rep_id, completed_at desc)
  where status = 'realizada' and completed_at is not null;

create table public.seller_weekly_activity_goals (
  sales_rep_id uuid primary key references public.sales_reps(id) on delete cascade,
  weekly_goal smallint not null check (weekly_goal between 1 and 50),
  effective_from date not null,
  effective_to date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint seller_weekly_activity_goals_dates
    check (effective_to is null or effective_to >= effective_from),
  constraint seller_weekly_activity_goals_monday
    check (extract(isodow from effective_from) = 1)
);

drop trigger if exists set_updated_at on public.seller_weekly_activity_goals;
create trigger set_updated_at before update on public.seller_weekly_activity_goals
  for each row execute function public.tg_set_updated_at();

alter table public.seller_weekly_activity_goals enable row level security;

create policy seller_weekly_activity_goals_select
  on public.seller_weekly_activity_goals
  for select
  using (
    (select public.can_read_all())
    or sales_rep_id = (select public.current_rep_id())
  );

create policy seller_weekly_activity_goals_admin_update
  on public.seller_weekly_activity_goals
  for update
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

revoke all on table public.seller_weekly_activity_goals from anon, authenticated;
grant select, update on table public.seller_weekly_activity_goals to authenticated;
grant all on table public.seller_weekly_activity_goals to service_role;

comment on table public.seller_weekly_activity_goals is
  'Metas semanales personalizadas de actividades comerciales calificadas.';
comment on column public.activities.completed_at is
  'Instante real en que la actividad fue marcada como realizada.';

with goals(email, weekly_goal) as (
  values
    ('andra@teravino.com', 15),
    ('citlali@teravino.com', 12),
    ('emmanuel@teravino.com', 12),
    ('felix@teravino.com', 15),
    ('saulo@teravino.com', 12),
    ('yamile@teravino.com', 15)
)
insert into public.seller_weekly_activity_goals (
  sales_rep_id, weekly_goal, effective_from, effective_to
)
select sr.id, goals.weekly_goal, date '2026-09-07', date '2026-10-04'
from goals
join public.sales_reps sr on lower(sr.email) = goals.email
on conflict (sales_rep_id) do update
set weekly_goal = excluded.weekly_goal,
    effective_from = excluded.effective_from,
    effective_to = excluded.effective_to,
    updated_at = now();
