-- ---------------------------------------------------------------------
-- Sugerencias de reabasto (restock)
-- 1) Lead time del proveedor por producto (días). null = usa el default del
--    modelo (lib/restock.ts → defaultLeadDays). Se podrá editar desde la ficha.
-- 2) Vista de velocidad de venta: promedio móvil de unidades por mes sobre los
--    últimos 3 meses, por SKU (codigo de CONTPAQ en monthly_sales_items).
--
-- El MODELO de reorden (punto de reorden, cantidad sugerida, fecha límite) NO
-- vive en SQL: vive en lib/restock.ts para ser simple, explicable y testeable.
-- Esta vista solo aporta la velocidad cruda.
-- ---------------------------------------------------------------------

alter table public.products
  add column if not exists lead_time_days int;

-- Velocidad de venta por SKU: unidades/mes (promedio sobre 3 meses).
-- Usa la facturación real (monthly_sales_items), no cotizaciones.
create or replace view public.v_product_sales_velocity as
select
  mi.codigo as sku,
  sum(mi.cantidad) as units_last_3m,
  count(distinct ms.period) as months_with_sales,
  round(sum(mi.cantidad) / 3.0, 2) as units_per_month,
  max(ms.period) as last_period
from public.monthly_sales_items mi
join public.monthly_sales ms on ms.id = mi.monthly_sale_id
where ms.period >= (date_trunc('month', current_date) - interval '3 months')
  and mi.codigo is not null
  and btrim(mi.codigo) <> ''
group by mi.codigo;

-- Respeta la RLS de las tablas base (monthly_sales* es lectura admin/contador).
alter view public.v_product_sales_velocity set (security_invoker = on);
