-- Estado de la actividad: permite AGENDAR visitas a futuro y marcarlas como
-- realizadas. Las filas existentes quedan como 'realizada' (eran registros de
-- algo que ya pasó).
alter table public.activities
  add column if not exists status text not null default 'realizada'
    check (status in ('agendada', 'realizada', 'cancelada'));

create index if not exists idx_activities_status_date
  on public.activities(status, activity_date);

-- Última actividad por cuenta, para el recordatorio "visitar pronto".
-- security_invoker => respeta RLS: cada vendedor solo ve sus cuentas.
create or replace view public.v_account_last_activity
with (security_invoker = true) as
select
  a.id            as account_id,
  a.business_name,
  a.region,
  a.account_type,
  a.status,
  a.assigned_rep_id,
  max(act.activity_date) filter (where act.status <> 'cancelada') as last_activity_date
from public.accounts a
left join public.activities act on act.account_id = a.id
group by a.id;

grant select on public.v_account_last_activity to authenticated, anon;
