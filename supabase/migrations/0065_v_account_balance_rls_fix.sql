-- =====================================================================
-- Fix de seguridad (RLS): v_account_balance perdió security_invoker
-- =====================================================================
-- La vista v_account_balance se recreó con CREATE OR REPLACE VIEW en las
-- migraciones 0043/0044/0046. Postgres NO conserva la opción `security_invoker`
-- al reemplazar una vista, así que quedó corriendo con los privilegios del
-- OWNER (postgres) y BYPASEABA la RLS de `accounts` e `invoices`.
--
-- Efecto del bug: cualquier vendedor veía la cartera de TODA la empresa
-- (saldos por cuenta de todos los vendedores) en /cartera y en los KPIs de
-- cartera del dashboard, no solo la suya.
--
-- Con security_invoker = on la vista corre con los privilegios de QUIEN la
-- consulta, por lo que respeta las políticas RLS de accounts/invoices: cada
-- vendedor ve solo sus cuentas asignadas; el admin sigue viendo todo.
-- =====================================================================

alter view public.v_account_balance set (security_invoker = on);
