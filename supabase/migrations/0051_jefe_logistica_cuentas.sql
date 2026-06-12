-- =====================================================================
-- 0051 — Jefe de logística (Isaí) puede VER el módulo de Cuentas
-- =====================================================================
-- El facturista/jefe de logística consulta las fichas de clientes para
-- facturar y coordinar entregas. Solo LECTURA: políticas aditivas de
-- SELECT en las tablas que usa el módulo Cuentas (lista + ficha); las
-- políticas de escritura no se tocan (siguen siendo admin / vendedor
-- asignado). Mismo patrón que 0024 (rol contador / can_read_all).
-- v_account_balance es security_invoker, así que hereda el SELECT de
-- accounts + invoices.
-- =====================================================================

create or replace function public.is_jefe_logistica()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.sales_reps
    where auth_user_id = auth.uid() and role = 'jefe_logistica' and active = true
  );
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'accounts', 'contacts', 'activities', 'account_products',
    'agreements', 'agreement_equipment',
    'orders', 'order_items', 'invoices', 'payments'
  ] loop
    execute format('drop policy if exists %I on public.%I', t || '_logistica_read', t);
    execute format(
      'create policy %I on public.%I for select using (public.is_jefe_logistica())',
      t || '_logistica_read', t
    );
  end loop;
end $$;
