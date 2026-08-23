-- Metas mensuales de ventas con cálculo estacional auditable.
-- Una proyección puede convertirse en meta bloqueada, pero una meta bloqueada
-- nunca es recalculada silenciosamente durante el mes.

create table public.seller_monthly_targets (
  id uuid primary key default gen_random_uuid(),
  sales_rep_id uuid not null references public.sales_reps(id) on delete cascade,
  period date not null,
  target_amount numeric(14,2) not null check (target_amount >= 0),
  minimum_floor numeric(14,2) not null check (minimum_floor >= 0),
  recent_average numeric(14,2) not null check (recent_average >= 0),
  prior_year_sales numeric(14,2) not null check (prior_year_sales >= 0),
  ytd_factor numeric(10,4) not null check (ytd_factor >= 0),
  recent_stretch numeric(14,2) not null check (recent_stretch >= 0),
  seasonal_stretch numeric(14,2) not null check (seasonal_stretch >= 0),
  selected_basis text not null check (
    selected_basis in ('floor', 'recent_average', 'seasonality', 'direction_override')
  ),
  status text not null check (status in ('projection', 'locked', 'overridden')),
  calculation_as_of date not null,
  formula_version text not null default 'seasonal_15_v1',
  locked_at timestamptz,
  override_reason text,
  overridden_by uuid references public.sales_reps(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint seller_monthly_targets_period_month_start
    check (period = date_trunc('month', period)::date),
  constraint seller_monthly_targets_override_reason
    check (status <> 'overridden' or nullif(btrim(override_reason), '') is not null),
  unique (sales_rep_id, period)
);

create index seller_monthly_targets_period_status_idx
  on public.seller_monthly_targets (period, status);

drop trigger if exists set_updated_at on public.seller_monthly_targets;
create trigger set_updated_at before update on public.seller_monthly_targets
  for each row execute function public.tg_set_updated_at();

alter table public.seller_monthly_targets enable row level security;

create policy seller_monthly_targets_select on public.seller_monthly_targets
  for select using (
    public.can_read_all() or sales_rep_id = (select public.current_rep_id())
  );

create policy seller_monthly_targets_admin_update on public.seller_monthly_targets
  for update using ((select public.is_admin()))
  with check ((select public.is_admin()));

revoke all on table public.seller_monthly_targets from anon, authenticated;
grant select, update on table public.seller_monthly_targets to authenticated;
grant all on table public.seller_monthly_targets to service_role;

comment on table public.seller_monthly_targets is
  'Metas de ventas por vendedor y mes. Conserva los componentes de la fórmula, proyecciones, bloqueos y ajustes de Dirección.';

-- Primer corte aprobado por Dirección el 23-ago-2026. Se usaron los últimos
-- tres cierres (may-jul), el mismo mes de 2025, el desempeño ene-jul 2026 vs
-- ene-jul 2025 y un reto de 15%; el resultado se redondeó hacia arriba a $25 mil.
with seed(
  email, period, target_amount, minimum_floor, recent_average,
  prior_year_sales, ytd_factor, recent_stretch, seasonal_stretch,
  selected_basis, status
) as (
  values
    ('andra@teravino.com',   date '2026-09-01',  500000, 500000, 333030.10, 300266.71, 0.9883, 382984.62,  341254.16, 'floor',          'locked'),
    ('andra@teravino.com',   date '2026-10-01',  725000, 600000, 333030.10, 628843.14, 0.9883, 382984.62,  714682.42, 'seasonality',    'projection'),
    ('andra@teravino.com',   date '2026-11-01',  825000, 700000, 333030.10, 714406.47, 0.9883, 382984.62,  811925.44, 'seasonality',    'projection'),
    ('citlali@teravino.com', date '2026-09-01',  300000, 275000, 227120.98, 117755.29, 2.1511, 261189.13,  291304.20, 'seasonality',    'locked'),
    ('citlali@teravino.com', date '2026-10-01',  550000, 325000, 227120.98, 221562.92, 2.1511, 261189.13,  548104.53, 'seasonality',    'projection'),
    ('citlali@teravino.com', date '2026-11-01',  525000, 350000, 227120.98, 202330.85, 2.1511, 261189.13,  500528.04, 'seasonality',    'projection'),
    ('yamile@teravino.com',  date '2026-09-01',  550000, 550000, 442676.41, 262860.42, 1.0800, 509077.88,  326462.72, 'floor',          'locked'),
    ('yamile@teravino.com',  date '2026-10-01',  950000, 750000, 442676.41, 751685.08, 1.0800, 509077.88,  933564.48, 'seasonality',    'projection'),
    ('yamile@teravino.com',  date '2026-11-01', 1250000, 900000, 442676.41, 997895.22, 1.0800, 509077.88, 1239348.17, 'seasonality',    'projection'),
    ('emmanuel@teravino.com',date '2026-09-01',  275000, 260000, 229272.28,  41710.09, 1.6917, 263663.13,   81143.30, 'recent_average', 'locked'),
    ('emmanuel@teravino.com',date '2026-10-01',  400000, 275000, 229272.28, 201453.95, 1.6917, 263663.13,  391910.89, 'seasonality',    'projection'),
    ('emmanuel@teravino.com',date '2026-11-01',  300000, 300000, 229272.28,  94631.11, 1.6917, 263663.13,  184096.48, 'floor',          'projection'),
    ('felix@teravino.com',   date '2026-09-01',  400000, 400000, 134091.29,  48736.68, 0.8628, 154204.99,   48359.56, 'floor',          'locked'),
    ('felix@teravino.com',   date '2026-10-01',  475000, 400000, 134091.29, 472806.68, 0.8628, 154204.99,  469148.15, 'seasonality',    'projection'),
    ('felix@teravino.com',   date '2026-11-01',  425000, 400000, 134091.29, 424550.45, 0.8628, 154204.99,  421265.32, 'seasonality',    'projection')
)
insert into public.seller_monthly_targets (
  sales_rep_id, period, target_amount, minimum_floor, recent_average,
  prior_year_sales, ytd_factor, recent_stretch, seasonal_stretch,
  selected_basis, status, calculation_as_of, locked_at
)
select
  sr.id, seed.period, seed.target_amount, seed.minimum_floor, seed.recent_average,
  seed.prior_year_sales, seed.ytd_factor, seed.recent_stretch, seed.seasonal_stretch,
  seed.selected_basis, seed.status, date '2026-07-31',
  case when seed.status = 'locked' then timestamptz '2026-08-23 10:00:00-07' end
from seed
join public.sales_reps sr on lower(sr.email) = seed.email
on conflict (sales_rep_id, period) do nothing;
