-- 0044: El "vencido" se calcula desde emisión + días de crédito (no desde due_date).
--
-- Bug: al cargar la cartera, due_date se guardó igual a la fecha de emisión (nunca
-- se sumaron los días de crédito de la cuenta). Como v_account_balance marcaba
-- vencido con `due_date < hoy`, TODA factura aparecía vencida al día siguiente de
-- emitirse, ignorando el crédito pactado (p.ej. Chileno Bay #176 con 60 días salía
-- con ~$203k vencidos cuando aún no vence nada).
--
-- Arreglo (fuente de verdad = accounts.credit_days):
--   1) La vista calcula el vencido como (invoice_date + credit_days) < hoy. Así se
--      autocorrige si cambias los días de crédito de una cuenta, y queda igual que
--      el cálculo de la tabla de detalle (lib/cartera.ts → diasVencidos).
--   2) Backfill: due_date = emisión + credit_days y status recalculado, para que el
--      dato guardado y el badge por factura concuerden con la vista.
-- credit_days nulo se trata como 0 (contado): vence al pasar la emisión, igual que antes.

-- 1) Vista: vencido derivado de emisión + días de crédito.
create or replace view public.v_account_balance as
select
  a.id as account_id,
  a.business_name,
  a.region,
  a.assigned_rep_id,
  coalesce(sum(i.total), 0) as total_facturado,
  coalesce(sum(i.total_paid), 0) as total_pagado,
  coalesce(sum(i.balance), 0) as saldo_pendiente,
  case
    when a.es_socio then 0
    else coalesce(sum(case
      when (i.invoice_date + coalesce(a.credit_days, 0)) < current_date and i.balance > 0
      then i.balance else 0 end), 0)
  end as saldo_vencido,
  count(case when i.status in ('pendiente', 'pagada_parcial', 'vencida') then 1 end) as facturas_abiertas,
  a.es_socio
from public.accounts a
left join public.invoices i on i.account_id = a.id and i.status <> 'cancelada'
group by a.id, a.business_name, a.region, a.assigned_rep_id, a.es_socio;

-- 2a) Backfill due_date = emisión + días de crédito (todas las no canceladas).
update public.invoices i
set due_date = (i.invoice_date + coalesce(a.credit_days, 0))
from public.accounts a
where i.account_id = a.id
  and i.status <> 'cancelada'
  and i.invoice_date is not null
  and i.due_date is distinct from (i.invoice_date + coalesce(a.credit_days, 0));

-- 2b) Recalcula status según el nuevo vencimiento (no toca canceladas).
update public.invoices i
set status = case
  when coalesce(i.balance, 0) <= 0 then 'pagada'
  when (i.invoice_date + coalesce(a.credit_days, 0)) < current_date then 'vencida'
  when coalesce(i.total_paid, 0) > 0 then 'pagada_parcial'
  else 'pendiente'
end
from public.accounts a
where i.account_id = a.id
  and i.status <> 'cancelada'
  and i.invoice_date is not null;
