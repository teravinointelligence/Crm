-- 0046: Re-agrega `dias_vencido` a v_account_balance.
--
-- Regresión: la migración 0044 hizo `create or replace view` y, al reescribir la
-- vista, omitió la columna `dias_vencido` que había agregado 0018. Quedó fuera del
-- esquema aunque el tipo AccountBalance y el semáforo de Cartera siguen leyéndola
-- (b.dias_vencido → undefined). La vista de "Crédito de clientes" (/reparto/credito)
-- la selecciona explícitamente, así que la consulta fallaba y la lista salía vacía.
--
-- Arreglo: vuelve a exponer `dias_vencido` = máximo de días vencidos de cualquier
-- factura con saldo, usando la MISMA fuente de verdad que el saldo_vencido de 0044
-- (emisión + accounts.credit_days), para que ambos concuerden y se autocorrijan si
-- cambian los días de crédito. Las cuentas socio se reportan con 0 (igual que su
-- saldo_vencido). credit_days nulo = 0 (contado).
--
-- Nota: `create or replace view` exige conservar las columnas existentes en el mismo
-- orden; la nueva columna se agrega AL FINAL (después de es_socio).

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
  a.es_socio,
  case
    when a.es_socio then 0
    else coalesce(max(case
      when (i.invoice_date + coalesce(a.credit_days, 0)) < current_date and i.balance > 0
      then current_date - (i.invoice_date + coalesce(a.credit_days, 0)) else 0 end), 0)
  end as dias_vencido
from public.accounts a
left join public.invoices i on i.account_id = a.id and i.status <> 'cancelada'
group by a.id, a.business_name, a.region, a.assigned_rep_id, a.es_socio;
