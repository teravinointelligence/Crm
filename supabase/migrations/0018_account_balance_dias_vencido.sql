-- =====================================================================
-- Días vencidos en la vista de saldos (para el semáforo de cobranza)
-- =====================================================================
-- Agrega `dias_vencido` = máximo de días que lleva vencida cualquier factura
-- abierta de la cuenta (0 si no hay vencidas). Alimenta el semáforo:
--   1-6 → alerta · 7-44 → vencido · 45+ → suspendido
-- =====================================================================

create or replace view public.v_account_balance as
select
  a.id as account_id,
  a.business_name,
  a.region,
  a.assigned_rep_id,
  coalesce(sum(i.total), 0) as total_facturado,
  coalesce(sum(i.total_paid), 0) as total_pagado,
  coalesce(sum(i.balance), 0) as saldo_pendiente,
  coalesce(sum(case when i.due_date < current_date and i.balance > 0
                    then i.balance else 0 end), 0) as saldo_vencido,
  count(case when i.status in ('pendiente','pagada_parcial','vencida') then 1 end)
    as facturas_abiertas,
  coalesce(max(case when i.due_date < current_date and i.balance > 0
                    then current_date - i.due_date else 0 end), 0) as dias_vencido
from public.accounts a
left join public.invoices i on i.account_id = a.id and i.status != 'cancelada'
group by a.id, a.business_name, a.region, a.assigned_rep_id;

-- Mantener security_invoker (fix 0014) para que respete RLS.
alter view public.v_account_balance set (security_invoker = on);
