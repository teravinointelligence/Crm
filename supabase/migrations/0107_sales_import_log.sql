-- Bitácora confiable de cargas del reporte de ventas.
-- A diferencia de monthly_sales.updated_at, conserva cada importación aunque
-- se vuelva a cargar el mismo mes.

create table if not exists public.sales_imports (
  id uuid primary key default gen_random_uuid(),
  imported_by uuid references public.sales_reps(id) on delete set null
    default public.current_rep_id(),
  period date not null,
  source_file_name text,
  source_format text not null
    check (source_format in ('contpaq', 'por_vendedor', 'historico')),
  customers_imported int not null default 0 check (customers_imported >= 0),
  product_lines_imported int not null default 0 check (product_lines_imported >= 0),
  rows_error int not null default 0 check (rows_error >= 0),
  imported_at timestamptz not null default now()
);

create index if not exists idx_sales_imports_imported_at
  on public.sales_imports(imported_at desc);
create index if not exists idx_sales_imports_imported_by
  on public.sales_imports(imported_by);

alter table public.sales_imports enable row level security;

drop policy if exists sales_imports_select on public.sales_imports;
create policy sales_imports_select on public.sales_imports
  for select to authenticated
  using ((select public.current_rep_id()) is not null);

drop policy if exists sales_imports_admin_insert on public.sales_imports;
create policy sales_imports_admin_insert on public.sales_imports
  for insert to authenticated
  with check (
    (select public.is_admin())
    and imported_by = (select public.current_rep_id())
  );

revoke all on table public.sales_imports from anon;
revoke all on table public.sales_imports from authenticated;
grant select, insert on table public.sales_imports to authenticated;

-- Conserva como punto de partida la última carga histórica que puede
-- demostrarse con las fechas de las tablas existentes. El nombre del archivo
-- y el usuario no existían antes de esta bitácora, por eso quedan nulos.
insert into public.sales_imports (
  imported_by, period, source_file_name, source_format,
  customers_imported, product_lines_imported, rows_error, imported_at
)
select
  null,
  latest.period,
  null,
  'historico',
  (select count(*)::int from public.monthly_sales where period = latest.period),
  (
    select count(*)::int
    from public.monthly_sales_items i
    join public.monthly_sales s on s.id = i.monthly_sale_id
    where s.period = latest.period
  ),
  0,
  latest.imported_at
from (
  select evidence.period, evidence.imported_at
  from (
    select ms.period,
           greatest(ms.created_at, ms.updated_at) as imported_at
    from public.monthly_sales ms
    union all
    select ms.period, i.created_at as imported_at
    from public.monthly_sales_items i
    join public.monthly_sales ms on ms.id = i.monthly_sale_id
  ) evidence
  where evidence.imported_at is not null
  order by evidence.imported_at desc
  limit 1
) latest
where not exists (select 1 from public.sales_imports);
