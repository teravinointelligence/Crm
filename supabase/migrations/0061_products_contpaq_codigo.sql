-- ---------------------------------------------------------------------
-- Puente catálogo ↔ CONTPAQ para el reabasto.
-- products.sku es un slug propio del CRM; las ventas (monthly_sales_items)
-- usan el `codigo` de CONTPAQ. NO comparten llave (intersección 0), así que
-- la velocidad de venta no se podía cruzar con el stock del catálogo.
--
-- `contpaq_codigo` guarda, por producto, su código de CONTPAQ (el mismo que
-- aparece en monthly_sales_items.codigo). Se puebla desde Catálogo → "Mapear
-- códigos CONTPAQ" (importa el export de CONTPAQ con codigo + clave/nombre y
-- empareja contra el catálogo con revisión humana).
--
-- Con esto, v_product_sales_velocity (por codigo) se une a products por
-- contpaq_codigo y el modelo de reabasto produce sugerencias reales.
-- ---------------------------------------------------------------------

alter table public.products
  add column if not exists contpaq_codigo text;

create index if not exists products_contpaq_codigo_idx
  on public.products (contpaq_codigo)
  where contpaq_codigo is not null;
