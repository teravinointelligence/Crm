-- =====================================================================
-- 0062 — Jefe de logística (Isaí) puede VER el módulo de Muestras
-- =====================================================================
-- El jefe de logística coordina la entrega de muestras, así que consulta
-- las solicitudes. Solo LECTURA: políticas aditivas de SELECT en las tablas
-- que usa el módulo (lista + ficha). Mismo patrón que 0051 (Cuentas) y 0024
-- (contador / can_read_all). Reusa la función public.is_jefe_logistica()
-- creada en 0051. La escritura/revisión sigue siendo de admin o del vendedor
-- dueño (no se tocan esas políticas).
-- =====================================================================

do $$
declare t text;
begin
  foreach t in array array[
    'sample_requests', 'sample_request_items', 'sample_request_activities'
  ] loop
    execute format('drop policy if exists %I on public.%I', t || '_logistica_read', t);
    execute format(
      'create policy %I on public.%I for select using (public.is_jefe_logistica())',
      t || '_logistica_read', t
    );
  end loop;
end $$;
