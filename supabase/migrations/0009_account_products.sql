-- Vinos por cuenta: encartados (ya compran) / muestras (probados) / descartados
create table if not exists public.account_products (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references public.accounts(id) on delete cascade not null,
  product_id uuid references public.products(id) on delete cascade not null,
  status text check (status in ('muestra','encartado','descartado')) default 'muestra',
  notes text,
  added_by uuid references public.sales_reps(id) on delete set null,
  since date,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (account_id, product_id)
);
create index if not exists idx_account_products_account on public.account_products(account_id);
create index if not exists idx_account_products_product on public.account_products(product_id);
create index if not exists idx_account_products_status on public.account_products(status);

drop trigger if exists set_updated_at on public.account_products;
create trigger set_updated_at before update on public.account_products
  for each row execute function public.tg_set_updated_at();

alter table public.account_products enable row level security;
drop policy if exists account_products_all on public.account_products;
create policy account_products_all on public.account_products
  for all using (
    public.is_admin() or exists (
      select 1 from public.accounts a
      where a.id = account_products.account_id and a.assigned_rep_id = public.current_rep_id()
    )
  ) with check (
    public.is_admin() or exists (
      select 1 from public.accounts a
      where a.id = account_products.account_id and a.assigned_rep_id = public.current_rep_id()
    )
  );
