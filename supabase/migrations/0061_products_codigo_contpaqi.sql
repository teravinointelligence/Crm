-- ---------------------------------------------------------------------
-- Puente catálogo ↔ CONTPAQ para reabasto e inventarios.
-- products.sku es un slug propio del CRM; las ventas (monthly_sales_items)
-- y los reportes de existencias de CONTPAQ usan el `codigo` de CONTPAQ.
-- NO comparten llave (intersección 0), así que ni la velocidad de venta ni
-- las existencias exportadas se podían cruzar con el catálogo.
--
-- `codigo_contpaqi` guarda, por producto, su código de CONTPAQ. Se puebla
-- desde Catálogo → "Mapear códigos CONTPAQ" (importa el export de CONTPAQ con
-- codigo + clave/nombre y empareja contra el catálogo con revisión humana).
--
-- NOTA: esta columna ya existe en prod (migración previa "codigo_contpaqi",
-- aplicada directo). Este archivo la recrea de forma idempotente para que el
-- esquema local (supabase db reset) concuerde. Antes hubo un intento paralelo
-- con el nombre `contpaq_codigo`; se consolidó todo en `codigo_contpaqi`.
-- ---------------------------------------------------------------------

alter table public.products
  add column if not exists codigo_contpaqi text;

create unique index if not exists idx_products_codigo_contpaqi
  on public.products (codigo_contpaqi)
  where codigo_contpaqi is not null;
