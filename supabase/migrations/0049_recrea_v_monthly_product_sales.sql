-- =====================================================================
-- Recrea v_monthly_product_sales (definida en 0016 pero ausente en prod
-- por drift del historial de migraciones). La usa /reportes para el top
-- de productos vendidos a partir del detalle CONTPAQ.
-- =====================================================================

create or replace view public.v_monthly_product_sales as
select
  ms.period,
  ms.sales_rep_id,
  msi.codigo,
  msi.producto_nombre,
  sum(msi.cantidad) as cantidad,
  sum(msi.total) as total,
  sum(msi.neto_desc) as neto_desc
from public.monthly_sales_items msi
join public.monthly_sales ms on ms.id = msi.monthly_sale_id
group by ms.period, ms.sales_rep_id, msi.codigo, msi.producto_nombre;

-- security_invoker para que la vista respete la RLS de monthly_sales(_items).
alter view public.v_monthly_product_sales set (security_invoker = on);
