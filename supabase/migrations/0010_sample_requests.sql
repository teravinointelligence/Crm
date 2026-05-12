-- Solicitudes de muestras por vendedor (botellas para catas / clientes)
create table if not exists public.sample_requests (
  id uuid primary key default gen_random_uuid(),
  request_number text unique not null,            -- MUE-2026-0001
  sales_rep_id uuid references public.sales_reps(id) on delete restrict not null,
  account_id uuid references public.accounts(id) on delete set null,
  reason text,
  status text check (status in ('borrador','enviada','aprobada','entregada','rechazada')) default 'borrador',
  reviewed_by uuid references public.sales_reps(id) on delete set null,
  reviewed_at timestamptz,
  review_notes text,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_sample_requests_rep on public.sample_requests(sales_rep_id);
create index if not exists idx_sample_requests_account on public.sample_requests(account_id);
create index if not exists idx_sample_requests_status on public.sample_requests(status);

create table if not exists public.sample_request_items (
  id uuid primary key default gen_random_uuid(),
  request_id uuid references public.sample_requests(id) on delete cascade not null,
  product_id uuid references public.products(id) on delete set null,
  product_name text not null,
  supplier text,
  quantity numeric(10,2) not null default 1,
  notes text
);
create index if not exists idx_sample_request_items_req on public.sample_request_items(request_id);

drop trigger if exists set_updated_at on public.sample_requests;
create trigger set_updated_at before update on public.sample_requests
  for each row execute function public.tg_set_updated_at();

alter table public.sample_requests enable row level security;
alter table public.sample_request_items enable row level security;

drop policy if exists sample_requests_select on public.sample_requests;
create policy sample_requests_select on public.sample_requests
  for select using (public.is_admin() or sales_rep_id = public.current_rep_id());
drop policy if exists sample_requests_insert on public.sample_requests;
create policy sample_requests_insert on public.sample_requests
  for insert with check (public.is_admin() or sales_rep_id = public.current_rep_id());
drop policy if exists sample_requests_update on public.sample_requests;
create policy sample_requests_update on public.sample_requests
  for update using (
    public.is_admin() or (sales_rep_id = public.current_rep_id() and status = 'borrador')
  ) with check (
    public.is_admin() or (sales_rep_id = public.current_rep_id() and status in ('borrador','enviada'))
  );

drop policy if exists sample_request_items_all on public.sample_request_items;
create policy sample_request_items_all on public.sample_request_items
  for all using (
    public.is_admin() or exists (
      select 1 from public.sample_requests r where r.id = sample_request_items.request_id and r.sales_rep_id = public.current_rep_id()
    )
  ) with check (
    public.is_admin() or exists (
      select 1 from public.sample_requests r where r.id = sample_request_items.request_id and r.sales_rep_id = public.current_rep_id()
    )
  );

create or replace function public.next_sample_number()
returns text language plpgsql set search_path = public as $$
declare v_year text; v_next int;
begin
  v_year := to_char(current_date, 'YYYY');
  select coalesce(max(substring(request_number from '\d+$')::int), 0) + 1 into v_next
    from public.sample_requests where request_number like 'MUE-' || v_year || '-%';
  return 'MUE-' || v_year || '-' || lpad(v_next::text, 4, '0');
end;
$$;
