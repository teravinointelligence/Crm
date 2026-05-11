-- =====================================================================
-- TERAVINO CRM — Row Level Security
-- =====================================================================
-- Modelo:
--   admin (Sabrina) → acceso total a todo
--   rep            → solo cuentas asignadas y sus relaciones
--   supplier_payments + v_supplier_balance → admin only
-- =====================================================================

-- Habilita RLS en todas las tablas
alter table public.sales_reps             enable row level security;
alter table public.accounts               enable row level security;
alter table public.contacts               enable row level security;
alter table public.activities             enable row level security;
alter table public.products               enable row level security;
alter table public.inventory_imports      enable row level security;
alter table public.orders                 enable row level security;
alter table public.order_items            enable row level security;
alter table public.invoices               enable row level security;
alter table public.payments               enable row level security;
alter table public.restock_requests       enable row level security;
alter table public.restock_request_items  enable row level security;
alter table public.purchase_orders        enable row level security;
alter table public.purchase_order_items   enable row level security;
alter table public.supplier_payments      enable row level security;

-- Helper functions con SECURITY DEFINER (evitan recursión de RLS)
create or replace function public.current_rep_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.sales_reps where auth_user_id = auth.uid() limit 1;
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.sales_reps
    where auth_user_id = auth.uid() and role = 'admin' and active = true
  );
$$;

-- ---------------------------------------------------------------------
-- SALES_REPS
-- ---------------------------------------------------------------------
drop policy if exists sales_reps_select on public.sales_reps;
create policy sales_reps_select on public.sales_reps
  for select using (auth.uid() is not null);

drop policy if exists sales_reps_admin_write on public.sales_reps;
create policy sales_reps_admin_write on public.sales_reps
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------
-- ACCOUNTS
-- ---------------------------------------------------------------------
drop policy if exists accounts_select on public.accounts;
create policy accounts_select on public.accounts
  for select using (
    public.is_admin() or assigned_rep_id = public.current_rep_id()
  );

drop policy if exists accounts_insert on public.accounts;
create policy accounts_insert on public.accounts
  for insert with check (
    public.is_admin() or assigned_rep_id = public.current_rep_id()
  );

drop policy if exists accounts_update on public.accounts;
create policy accounts_update on public.accounts
  for update using (
    public.is_admin() or assigned_rep_id = public.current_rep_id()
  ) with check (
    public.is_admin() or assigned_rep_id = public.current_rep_id()
  );

drop policy if exists accounts_delete on public.accounts;
create policy accounts_delete on public.accounts
  for delete using (public.is_admin());

-- ---------------------------------------------------------------------
-- CONTACTS (via accounts.assigned_rep_id)
-- ---------------------------------------------------------------------
drop policy if exists contacts_all on public.contacts;
create policy contacts_all on public.contacts
  for all using (
    public.is_admin() or exists (
      select 1 from public.accounts a
      where a.id = contacts.account_id
        and a.assigned_rep_id = public.current_rep_id()
    )
  ) with check (
    public.is_admin() or exists (
      select 1 from public.accounts a
      where a.id = contacts.account_id
        and a.assigned_rep_id = public.current_rep_id()
    )
  );

-- ---------------------------------------------------------------------
-- ACTIVITIES
-- ---------------------------------------------------------------------
drop policy if exists activities_all on public.activities;
create policy activities_all on public.activities
  for all using (
    public.is_admin() or sales_rep_id = public.current_rep_id() or exists (
      select 1 from public.accounts a
      where a.id = activities.account_id
        and a.assigned_rep_id = public.current_rep_id()
    )
  ) with check (
    public.is_admin() or sales_rep_id = public.current_rep_id() or exists (
      select 1 from public.accounts a
      where a.id = activities.account_id
        and a.assigned_rep_id = public.current_rep_id()
    )
  );

-- ---------------------------------------------------------------------
-- PRODUCTS — todos leen, solo admin escribe
-- ---------------------------------------------------------------------
drop policy if exists products_select on public.products;
create policy products_select on public.products
  for select using (auth.uid() is not null);

drop policy if exists products_admin_write on public.products;
create policy products_admin_write on public.products
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists inv_imports_admin on public.inventory_imports;
create policy inv_imports_admin on public.inventory_imports
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------
-- ORDERS / ORDER_ITEMS
-- ---------------------------------------------------------------------
drop policy if exists orders_all on public.orders;
create policy orders_all on public.orders
  for all using (
    public.is_admin() or sales_rep_id = public.current_rep_id() or exists (
      select 1 from public.accounts a
      where a.id = orders.account_id
        and a.assigned_rep_id = public.current_rep_id()
    )
  ) with check (
    public.is_admin() or sales_rep_id = public.current_rep_id() or exists (
      select 1 from public.accounts a
      where a.id = orders.account_id
        and a.assigned_rep_id = public.current_rep_id()
    )
  );

drop policy if exists order_items_all on public.order_items;
create policy order_items_all on public.order_items
  for all using (
    public.is_admin() or exists (
      select 1 from public.orders o
      where o.id = order_items.order_id
        and (o.sales_rep_id = public.current_rep_id()
             or exists (
               select 1 from public.accounts a
               where a.id = o.account_id
                 and a.assigned_rep_id = public.current_rep_id()
             ))
    )
  ) with check (
    public.is_admin() or exists (
      select 1 from public.orders o
      where o.id = order_items.order_id
        and (o.sales_rep_id = public.current_rep_id()
             or exists (
               select 1 from public.accounts a
               where a.id = o.account_id
                 and a.assigned_rep_id = public.current_rep_id()
             ))
    )
  );

-- ---------------------------------------------------------------------
-- INVOICES / PAYMENTS — rep lee solo suyas, admin todo
-- ---------------------------------------------------------------------
drop policy if exists invoices_select on public.invoices;
create policy invoices_select on public.invoices
  for select using (
    public.is_admin() or exists (
      select 1 from public.accounts a
      where a.id = invoices.account_id
        and a.assigned_rep_id = public.current_rep_id()
    )
  );

drop policy if exists invoices_admin_write on public.invoices;
create policy invoices_admin_write on public.invoices
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists payments_select on public.payments;
create policy payments_select on public.payments
  for select using (
    public.is_admin() or exists (
      select 1 from public.accounts a
      where a.id = payments.account_id
        and a.assigned_rep_id = public.current_rep_id()
    )
  );

drop policy if exists payments_admin_write on public.payments;
create policy payments_admin_write on public.payments
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------
-- RESTOCK
-- ---------------------------------------------------------------------
drop policy if exists restock_select on public.restock_requests;
create policy restock_select on public.restock_requests
  for select using (
    public.is_admin() or sales_rep_id = public.current_rep_id()
  );

drop policy if exists restock_insert on public.restock_requests;
create policy restock_insert on public.restock_requests
  for insert with check (
    public.is_admin() or sales_rep_id = public.current_rep_id()
  );

drop policy if exists restock_update on public.restock_requests;
create policy restock_update on public.restock_requests
  for update using (
    public.is_admin() or
    (sales_rep_id = public.current_rep_id() and status = 'borrador')
  ) with check (
    public.is_admin() or
    (sales_rep_id = public.current_rep_id() and status in ('borrador','enviada'))
  );

drop policy if exists restock_items_all on public.restock_request_items;
create policy restock_items_all on public.restock_request_items
  for all using (
    public.is_admin() or exists (
      select 1 from public.restock_requests r
      where r.id = restock_request_items.request_id
        and r.sales_rep_id = public.current_rep_id()
    )
  ) with check (
    public.is_admin() or exists (
      select 1 from public.restock_requests r
      where r.id = restock_request_items.request_id
        and r.sales_rep_id = public.current_rep_id()
    )
  );

-- ---------------------------------------------------------------------
-- PURCHASE ORDERS — admin only (rep solo lectura)
-- ---------------------------------------------------------------------
drop policy if exists po_select on public.purchase_orders;
create policy po_select on public.purchase_orders
  for select using (auth.uid() is not null);

drop policy if exists po_admin_write on public.purchase_orders;
create policy po_admin_write on public.purchase_orders
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists po_items_select on public.purchase_order_items;
create policy po_items_select on public.purchase_order_items
  for select using (auth.uid() is not null);

drop policy if exists po_items_admin_write on public.purchase_order_items;
create policy po_items_admin_write on public.purchase_order_items
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------
-- SUPPLIER PAYMENTS — admin only, total
-- ---------------------------------------------------------------------
drop policy if exists supplier_payments_admin on public.supplier_payments;
create policy supplier_payments_admin on public.supplier_payments
  for all using (public.is_admin()) with check (public.is_admin());
