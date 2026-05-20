-- =====================================================================
-- Fix de seguridad: forzar security_invoker en las vistas
-- =====================================================================
-- Por default, Postgres ejecuta las vistas con los privilegios del owner
-- (postgres/supabase_admin), lo que BYPASEA las políticas RLS de las
-- tablas base. Eso significa que un vendedor consultando `v_account_balance`
-- veía la cartera de TODA la empresa, no solo la de sus cuentas.
--
-- `security_invoker = on` (Postgres ≥15, ya disponible en Supabase) hace
-- que la vista corra con los privilegios del usuario que la consulta,
-- aplicando la RLS de las tablas subyacentes.
--
-- Tablas que ahora respetan RLS al ser leídas vía estas vistas:
--   v_account_balance     → accounts, invoices, payments
--   v_products_in_transit → purchase_orders, purchase_order_items
--   v_supplier_balance    → purchase_orders, supplier_payments
-- =====================================================================

alter view public.v_account_balance     set (security_invoker = on);
alter view public.v_products_in_transit set (security_invoker = on);
alter view public.v_supplier_balance    set (security_invoker = on);
