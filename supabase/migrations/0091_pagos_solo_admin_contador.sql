-- =====================================================================
-- Cartera: aplicar pagos es exclusivo de admin y contador
-- =====================================================================
-- Antes (0006) los vendedores podían escribir facturas y pagos de sus
-- propias cuentas: cualquier vendedor podía "Registrar pago" desde el
-- estado de cuenta de su cliente. Eso produjo pagos mal aplicados
-- (p. ej. un SPEI combinado aplicado dos veces, caso La Coyota #423).
--
-- Regla nueva: solo admin y contador (can_reconcile(), definido en 0035)
-- pueden escribir en invoices / payments / payment_allocations. Los
-- vendedores, choferes y jefe de logística conservan su LECTURA tal cual
-- (las políticas de SELECT no se tocan). apply_payment y
-- reconcile_transaction corren con permisos del invocador, así que estas
-- políticas también los gobiernan.
-- =====================================================================

drop policy if exists invoices_write on public.invoices;
create policy invoices_write on public.invoices
  for all using (public.can_reconcile()) with check (public.can_reconcile());

drop policy if exists payments_write on public.payments;
create policy payments_write on public.payments
  for all using (public.can_reconcile()) with check (public.can_reconcile());

drop policy if exists payment_allocations_write on public.payment_allocations;
create policy payment_allocations_write on public.payment_allocations
  for all using (public.can_reconcile()) with check (public.can_reconcile());
