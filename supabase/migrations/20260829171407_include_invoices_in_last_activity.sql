-- Una cuenta que factura sigue teniendo actividad comercial aunque el vendedor
-- no haya capturado una visita o llamada. Unificamos ambas señales para que el
-- Dashboard, los recordatorios y la reasignacion usen la misma fecha real.
--
-- Las facturas canceladas no cuentan. Los agregados separados evitan el
-- producto cartesiano que se produciria al unir activities e invoices directo.
create or replace view public.v_account_last_activity
with (security_invoker = true) as
with latest_manual_activity as (
  select
    act.account_id,
    max(act.activity_date) as last_activity_date
  from public.activities act
  where act.status <> 'cancelada'
  group by act.account_id
),
latest_invoice as (
  select
    i.account_id,
    max(i.invoice_date)::timestamp at time zone 'America/Mazatlan' as last_invoice_date
  from public.invoices i
  where i.status is distinct from 'cancelada'
  group by i.account_id
)
select
  a.id as account_id,
  a.business_name,
  a.region,
  a.account_type,
  a.status,
  a.assigned_rep_id,
  greatest(manual.last_activity_date, invoice.last_invoice_date) as last_activity_date
from public.accounts a
left join latest_manual_activity manual on manual.account_id = a.id
left join latest_invoice invoice on invoice.account_id = a.id;

comment on view public.v_account_last_activity is
  'Ultima actividad comercial por cuenta: actividad no cancelada o factura no cancelada, la mas reciente.';

grant select on public.v_account_last_activity to authenticated, anon;
