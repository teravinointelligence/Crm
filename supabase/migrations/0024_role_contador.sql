-- =====================================================================
-- Rol nuevo: Contador (contabilidad)
-- =====================================================================
-- El Contador es un rol de SOLO LECTURA GLOBAL: ve los datos de toda la
-- empresa (como un admin) para fines contables, pero NO administra usuarios
-- ni puede escribir (los candados de escritura siguen siendo is_admin()).
-- A nivel de páginas: ve los 13 módulos estándar + Cuentas por pagar + Reportes
-- (esto último se controla en el código, no aquí).
-- =====================================================================

-- 1. Ampliar el CHECK de roles.
alter table public.sales_reps drop constraint if exists sales_reps_role_check;
alter table public.sales_reps
  add constraint sales_reps_role_check
  check (role in ('admin', 'rep', 'chofer', 'jefe_logistica', 'contador'));

-- 2. Predicado de "lectura global": admin o contador activo.
create or replace function public.can_read_all()
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (
    select 1 from public.sales_reps
    where auth_user_id = auth.uid() and role = 'contador' and active = true
  );
$$;

-- 3. Políticas ADITIVAS de SELECT (permissive → se combinan con OR con las
--    existentes). Solo lectura: no se tocan las políticas de escritura, así que
--    el Contador puede ver todo pero no modificar nada.
do $$
declare t text;
begin
  foreach t in array array[
    'accounts', 'contacts', 'activities', 'account_products',
    'invoices', 'payments', 'orders', 'order_items',
    'monthly_sales', 'monthly_sales_items',
    'restock_requests', 'restock_request_items',
    'sample_requests', 'sample_request_items', 'sample_request_activities',
    'supplier_payments', 'inventory_imports'
  ] loop
    execute format('drop policy if exists %I on public.%I', t || '_finance_read', t);
    execute format(
      'create policy %I on public.%I for select using (public.can_read_all())',
      t || '_finance_read', t
    );
  end loop;
end $$;
