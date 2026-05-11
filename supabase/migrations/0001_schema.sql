-- =====================================================================
-- TERAVINO CRM — schema completo
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- VENDEDORES
-- ---------------------------------------------------------------------
create table if not exists public.sales_reps (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid references auth.users(id) on delete set null,
  email text unique not null,
  full_name text not null,
  primary_region text,
  role text default 'rep' check (role in ('admin','rep')),
  active boolean default true,
  created_at timestamptz default now()
);

create index if not exists idx_sales_reps_auth on public.sales_reps(auth_user_id);

-- ---------------------------------------------------------------------
-- CUENTAS / CLIENTES HORECA
-- ---------------------------------------------------------------------
create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  business_name text not null,
  account_type text check (account_type in
    ('hotel','restaurante','bar','cafe','club','tienda','distribuidor','otro')),
  region text check (region in
    ('Los Cabos','La Paz','Todos Santos','Tijuana','Puerto Vallarta','Nayarit')),
  city text,
  address text,
  rfc text,
  fiscal_name text,
  price_tier text default 'base' check (price_tier in ('base','+10')),
  assigned_rep_id uuid references public.sales_reps(id) on delete set null,
  status text default 'prospecto' check (status in
    ('prospecto','activo','inactivo','perdido')),
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_accounts_rep on public.accounts(assigned_rep_id);
create index if not exists idx_accounts_region on public.accounts(region);
create index if not exists idx_accounts_status on public.accounts(status);

-- ---------------------------------------------------------------------
-- CONTACTOS POR CUENTA
-- ---------------------------------------------------------------------
create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references public.accounts(id) on delete cascade not null,
  full_name text not null,
  role text,
  email text,
  phone text,
  whatsapp text,
  is_primary boolean default false,
  notes text,
  created_at timestamptz default now()
);

create index if not exists idx_contacts_account on public.contacts(account_id);

-- ---------------------------------------------------------------------
-- ACTIVIDADES / VISITAS
-- ---------------------------------------------------------------------
create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references public.accounts(id) on delete cascade not null,
  contact_id uuid references public.contacts(id) on delete set null,
  sales_rep_id uuid references public.sales_reps(id) on delete set null,
  activity_type text check (activity_type in
    ('visita','llamada','email','whatsapp','degustacion','reunion','evento')),
  activity_date timestamptz not null,
  duration_minutes int,
  outcome text,
  next_step text,
  next_step_date date,
  notes text,
  created_at timestamptz default now()
);

create index if not exists idx_activities_account on public.activities(account_id);
create index if not exists idx_activities_rep_date
  on public.activities(sales_rep_id, activity_date desc);
create index if not exists idx_activities_next_step
  on public.activities(next_step_date) where next_step_date is not null;

-- ---------------------------------------------------------------------
-- CATÁLOGO DE PRODUCTOS
-- ---------------------------------------------------------------------
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  sku text unique,
  name text not null,
  supplier text not null,
  category text check (category in
    ('vino_tinto','vino_blanco','vino_rosado','vino_naranja','espumoso',
     'destilado','cerveza','sake','otro')),
  varietal text,
  country text,
  region_origin text,
  vintage text,
  volume_ml int default 750,
  base_price numeric(12,2) not null,
  stock_quantity numeric(10,2) default 0,
  stock_min_alert numeric(10,2) default 6,
  last_stock_update timestamptz,
  last_stock_source text,
  active boolean default true,
  image_url text,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_products_supplier on public.products(supplier);
create index if not exists idx_products_active on public.products(active);
create index if not exists idx_products_category on public.products(category);
create index if not exists idx_products_name_trgm
  on public.products using gin (name gin_trgm_ops);

-- pg_trgm for fuzzy search
create extension if not exists pg_trgm;

-- ---------------------------------------------------------------------
-- BITÁCORA DE IMPORTS DE INVENTARIO
-- ---------------------------------------------------------------------
create table if not exists public.inventory_imports (
  id uuid primary key default gen_random_uuid(),
  imported_by uuid references public.sales_reps(id) on delete set null,
  import_type text check (import_type in ('catalogo_completo','solo_stock')),
  source_file_name text,
  rows_total int,
  rows_ok int,
  rows_error int,
  error_log jsonb,
  imported_at timestamptz default now()
);

-- ---------------------------------------------------------------------
-- PEDIDOS / COTIZACIONES
-- ---------------------------------------------------------------------
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text unique not null,
  account_id uuid references public.accounts(id) on delete restrict not null,
  sales_rep_id uuid references public.sales_reps(id) on delete set null,
  order_type text check (order_type in ('cotizacion','pedido')) not null,
  status text check (status in
    ('borrador','enviada','aceptada','rechazada','facturada','entregada','cancelada'))
    default 'borrador',
  order_date date not null default current_date,
  subtotal numeric(12,2) default 0,
  iva numeric(12,2) default 0,
  total numeric(12,2) default 0,
  notes text,
  created_at timestamptz default now()
);

create index if not exists idx_orders_account on public.orders(account_id);
create index if not exists idx_orders_rep on public.orders(sales_rep_id);
create index if not exists idx_orders_status on public.orders(status);
create index if not exists idx_orders_date on public.orders(order_date desc);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders(id) on delete cascade not null,
  product_id uuid references public.products(id) on delete set null,
  product_name text not null,
  supplier text,
  vintage text,
  quantity numeric(10,2) not null default 1,
  unit text default 'botella',
  unit_price numeric(12,2) not null default 0,
  line_total numeric(12,2) not null default 0
);

create index if not exists idx_order_items_order on public.order_items(order_id);

-- ---------------------------------------------------------------------
-- CARTERA DE CLIENTES (Estado de Cuenta / AR)
-- ---------------------------------------------------------------------
create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text unique not null,
  account_id uuid references public.accounts(id) on delete restrict not null,
  order_id uuid references public.orders(id) on delete set null,
  invoice_date date not null,
  due_date date,
  payment_terms_days int default 30,
  subtotal numeric(12,2),
  iva numeric(12,2),
  total numeric(12,2) not null,
  total_paid numeric(12,2) default 0,
  balance numeric(12,2) generated always as (total - coalesce(total_paid, 0)) stored,
  status text check (status in
    ('pendiente','pagada_parcial','pagada','vencida','cancelada')) default 'pendiente',
  uuid_fiscal text,
  pdf_url text,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_invoices_account on public.invoices(account_id);
create index if not exists idx_invoices_status on public.invoices(status);
create index if not exists idx_invoices_due on public.invoices(due_date);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid references public.invoices(id) on delete cascade,
  account_id uuid references public.accounts(id) on delete restrict not null,
  payment_date date not null,
  amount numeric(12,2) not null,
  method text check (method in
    ('transferencia','efectivo','cheque','tarjeta','deposito','otro')),
  reference text,
  notes text,
  created_at timestamptz default now()
);

create index if not exists idx_payments_invoice on public.payments(invoice_id);

-- Vista de saldos por cliente
create or replace view public.v_account_balance as
select
  a.id as account_id,
  a.business_name,
  a.region,
  a.assigned_rep_id,
  coalesce(sum(i.total), 0) as total_facturado,
  coalesce(sum(i.total_paid), 0) as total_pagado,
  coalesce(sum(i.balance), 0) as saldo_pendiente,
  coalesce(sum(case when i.due_date < current_date and i.balance > 0
                    then i.balance else 0 end), 0) as saldo_vencido,
  count(case when i.status in ('pendiente','pagada_parcial','vencida') then 1 end)
    as facturas_abiertas
from public.accounts a
left join public.invoices i on i.account_id = a.id and i.status != 'cancelada'
group by a.id, a.business_name, a.region, a.assigned_rep_id;

-- ---------------------------------------------------------------------
-- PEDIDOS DE RESTOCK (vendedor → admin)
-- ---------------------------------------------------------------------
create table if not exists public.restock_requests (
  id uuid primary key default gen_random_uuid(),
  request_number text unique not null,
  sales_rep_id uuid references public.sales_reps(id) on delete restrict not null,
  region_destino text check (region_destino in
    ('Los Cabos','La Paz','Todos Santos','Tijuana','Puerto Vallarta','Nayarit')),
  status text check (status in
    ('borrador','enviada','aprobada','rechazada','convertida_oc')) default 'borrador',
  reviewed_by uuid references public.sales_reps(id) on delete set null,
  reviewed_at timestamptz,
  review_notes text,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_restock_rep on public.restock_requests(sales_rep_id);
create index if not exists idx_restock_status on public.restock_requests(status);

create table if not exists public.restock_request_items (
  id uuid primary key default gen_random_uuid(),
  request_id uuid references public.restock_requests(id) on delete cascade not null,
  product_id uuid references public.products(id) on delete set null,
  product_name text not null,
  supplier text,
  quantity_requested numeric(10,2) not null,
  quantity_approved numeric(10,2),
  notes text
);

-- ---------------------------------------------------------------------
-- ÓRDENES DE COMPRA A PROVEEDORES
-- ---------------------------------------------------------------------
create table if not exists public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  po_number text unique not null,
  supplier text not null,
  source_request_ids uuid[],
  status text check (status in
    ('borrador','enviada_proveedor','confirmada','facturada',
     'en_transito','recibida_parcial','recibida','cancelada')) default 'borrador',
  order_date date not null default current_date,
  expected_arrival_date date,
  supplier_invoice_number text,
  supplier_invoice_date date,
  supplier_invoice_due_date date,
  supplier_invoice_pdf_url text,
  payment_terms_days int default 30,
  shipping_carrier text,
  tracking_number text,
  subtotal numeric(12,2),
  iva numeric(12,2),
  total numeric(12,2),
  total_paid numeric(12,2) default 0,
  balance numeric(12,2) generated always as
    (coalesce(total, 0) - coalesce(total_paid, 0)) stored,
  payment_status text check (payment_status in
    ('sin_facturar','pendiente','pagada_parcial','pagada','vencida'))
    default 'sin_facturar',
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_po_supplier on public.purchase_orders(supplier);
create index if not exists idx_po_status on public.purchase_orders(status);
create index if not exists idx_po_eta
  on public.purchase_orders(expected_arrival_date);

create table if not exists public.purchase_order_items (
  id uuid primary key default gen_random_uuid(),
  po_id uuid references public.purchase_orders(id) on delete cascade not null,
  product_id uuid references public.products(id) on delete set null,
  product_name text not null,
  quantity_ordered numeric(10,2) not null,
  quantity_received numeric(10,2) default 0,
  unit_cost numeric(12,2),
  line_total numeric(12,2),
  destination_region text,
  notes text
);

create or replace view public.v_products_in_transit as
select
  poi.product_id,
  poi.product_name,
  po.supplier,
  sum(poi.quantity_ordered - coalesce(poi.quantity_received, 0))
    as quantity_in_transit,
  min(po.expected_arrival_date) as earliest_eta,
  array_agg(distinct po.po_number) as po_numbers,
  array_agg(distinct po.status) as statuses
from public.purchase_order_items poi
join public.purchase_orders po on po.id = poi.po_id
where po.status in ('confirmada','facturada','en_transito','recibida_parcial')
  and (poi.quantity_ordered - coalesce(poi.quantity_received, 0)) > 0
group by poi.product_id, poi.product_name, po.supplier;

-- ---------------------------------------------------------------------
-- CUENTAS POR PAGAR
-- ---------------------------------------------------------------------
create table if not exists public.supplier_payments (
  id uuid primary key default gen_random_uuid(),
  po_id uuid references public.purchase_orders(id) on delete set null,
  supplier text not null,
  payment_date date not null,
  amount numeric(12,2) not null,
  method text check (method in
    ('transferencia','cheque','efectivo','tarjeta','deposito','otro')),
  reference text,
  notes text,
  paid_by uuid references public.sales_reps(id) on delete set null,
  created_at timestamptz default now()
);

create index if not exists idx_supplier_payments_po on public.supplier_payments(po_id);
create index if not exists idx_supplier_payments_supplier
  on public.supplier_payments(supplier);

create or replace view public.v_supplier_balance as
select
  po.supplier,
  count(*) filter (where po.payment_status in
    ('pendiente','pagada_parcial','vencida')) as facturas_abiertas,
  coalesce(sum(po.total), 0) as total_facturado,
  coalesce(sum(po.total_paid), 0) as total_pagado,
  coalesce(sum(po.balance), 0) as saldo_pendiente,
  coalesce(sum(case when po.supplier_invoice_due_date < current_date
                     and po.balance > 0 then po.balance else 0 end), 0)
    as saldo_vencido
from public.purchase_orders po
where po.supplier_invoice_number is not null
  and po.status != 'cancelada'
group by po.supplier;

-- ---------------------------------------------------------------------
-- FUNCIONES HELPER
-- ---------------------------------------------------------------------

-- Precio por región (base / +10%)
create or replace function public.get_product_price(
  p_product_id uuid,
  p_price_tier text
) returns numeric language sql stable as $$
  select case
    when p_price_tier = '+10' then round(base_price * 1.10, 2)
    else base_price
  end
  from public.products where id = p_product_id;
$$;

-- Numeración secuencial transaction-safe para órdenes (COT-YYYY-NNNN / PED-YYYY-NNNN)
create or replace function public.next_order_number(p_order_type text)
returns text language plpgsql as $$
declare
  v_prefix text;
  v_year text;
  v_next int;
  v_pattern text;
begin
  v_prefix := case p_order_type
    when 'cotizacion' then 'COT'
    when 'pedido' then 'PED'
    else 'ORD'
  end;
  v_year := to_char(current_date, 'YYYY');
  v_pattern := v_prefix || '-' || v_year || '-%';

  select coalesce(
    max(substring(order_number from '\d+$')::int), 0
  ) + 1
  into v_next
  from public.orders
  where order_number like v_pattern;

  return v_prefix || '-' || v_year || '-' || lpad(v_next::text, 4, '0');
end;
$$;

-- Numeración para restock requests / POs
create or replace function public.next_request_number()
returns text language plpgsql as $$
declare v_year text; v_next int;
begin
  v_year := to_char(current_date, 'YYYY');
  select coalesce(max(substring(request_number from '\d+$')::int), 0) + 1
    into v_next
    from public.restock_requests
   where request_number like 'REQ-' || v_year || '-%';
  return 'REQ-' || v_year || '-' || lpad(v_next::text, 4, '0');
end;
$$;

create or replace function public.next_po_number()
returns text language plpgsql as $$
declare v_year text; v_next int;
begin
  v_year := to_char(current_date, 'YYYY');
  select coalesce(max(substring(po_number from '\d+$')::int), 0) + 1
    into v_next
    from public.purchase_orders
   where po_number like 'OC-' || v_year || '-%';
  return 'OC-' || v_year || '-' || lpad(v_next::text, 4, '0');
end;
$$;

-- Trigger genérico de updated_at
create or replace function public.tg_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists set_updated_at on public.accounts;
create trigger set_updated_at before update on public.accounts
  for each row execute function public.tg_set_updated_at();

drop trigger if exists set_updated_at on public.products;
create trigger set_updated_at before update on public.products
  for each row execute function public.tg_set_updated_at();

drop trigger if exists set_updated_at on public.invoices;
create trigger set_updated_at before update on public.invoices
  for each row execute function public.tg_set_updated_at();

drop trigger if exists set_updated_at on public.restock_requests;
create trigger set_updated_at before update on public.restock_requests
  for each row execute function public.tg_set_updated_at();

drop trigger if exists set_updated_at on public.purchase_orders;
create trigger set_updated_at before update on public.purchase_orders
  for each row execute function public.tg_set_updated_at();
