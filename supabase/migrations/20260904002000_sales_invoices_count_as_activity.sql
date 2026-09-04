-- Las cuentas que siguen comprando no deben perderse por falta de una actividad
-- manual. La fuente usada por el barrido de reasignación ahora toma la fecha más
-- reciente entre:
--   1) actividad CRM no cancelada;
--   2) factura válida con total positivo;
--   3) mes con ventas positivas.
--
-- Para ventas mensuales, la cuenta se considera activa durante todo el mes
-- reportado. La fecha se limita a CURRENT_DATE para nunca producir una fecha
-- futura.

create or replace view public.v_account_last_activity
with (security_invoker = true) as
with manual_activity as (
  select
    act.account_id,
    max(act.activity_date) filter (where act.status <> 'cancelada') as last_manual_activity_date
  from public.activities act
  group by act.account_id
),
invoice_activity as (
  select
    i.account_id,
    max(i.invoice_date)::timestamptz as last_invoice_date
  from public.invoices i
  where i.total > 0
    and lower(coalesce(i.status, '')) not in ('cancelada', 'cancelado')
  group by i.account_id
),
sales_activity as (
  select
    s.account_id,
    least(
      current_date,
      (max(s.period) + interval '1 month - 1 day')::date
    )::timestamptz as last_sales_activity_date
  from public.monthly_sales s
  where greatest(
    coalesce(s.venta_bruta, 0),
    coalesce(s.neto, 0),
    coalesce(s.neto_desc, 0)
  ) > 0
  group by s.account_id
)
select
  a.id as account_id,
  a.business_name,
  a.region,
  a.account_type,
  a.status,
  a.assigned_rep_id,
  (
    select max(v.activity_date)
    from (values
      (ma.last_manual_activity_date),
      (ia.last_invoice_date),
      (sa.last_sales_activity_date)
    ) as v(activity_date)
  ) as last_activity_date
from public.accounts a
left join manual_activity ma on ma.account_id = a.id
left join invoice_activity ia on ia.account_id = a.id
left join sales_activity sa on sa.account_id = a.id;

comment on view public.v_account_last_activity is
'Última actividad comercial por cuenta. Para evitar reasignaciones erróneas por inactividad, considera actividades manuales no canceladas, facturas válidas y ventas mensuales positivas. Una venta mensual mantiene activa la cuenta hasta el cierre de ese mes, sin usar fechas futuras.';
