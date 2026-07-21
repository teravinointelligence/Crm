-- =====================================================================
-- 0094 — Jefe de logística (Isaí) puede VER el banco de muestras
-- =====================================================================
-- Coordina la entrega de muestras entre bodegas, así que consulta el banco
-- completo (todas las zonas). Solo LECTURA aditiva sobre los movimientos —
-- la vista v_sample_bank es security_invoker y hereda esta política. Las
-- solicitudes ya las ve desde 0062; tomar/liberar sigue siendo de admin y
-- vendedores (el RPC take_from_bank valida la zona del vendedor).
-- Mismo patrón que 0062/0051 (public.is_jefe_logistica()).
-- =====================================================================

drop policy if exists sample_bank_logistica_read on public.sample_bank_movements;
create policy sample_bank_logistica_read on public.sample_bank_movements
  for select using (public.is_jefe_logistica());
