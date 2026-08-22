-- =====================================================================
-- Conversión y retorno de muestras
-- =====================================================================
-- Registra cada uso atribuible a cliente + vino, conserva el costo de la
-- botella al momento del uso y aplica un límite dinámico por vendedor según
-- conversión/ROI. Los resultados de venta se cruzan con monthly_sales_items.
-- =====================================================================

alter table public.products
  add column if not exists sample_unit_cost numeric(12,2)
  check (sample_unit_cost is null or sample_unit_cost >= 0);

comment on column public.products.sample_unit_cost is
  'Costo real por botella para medir inversión en muestras. Si falta, se usa base_price como estimación visible.';

create table if not exists public.sample_conversion_settings (
  id boolean primary key default true check (id),
  analysis_days int not null default 180 check (analysis_days between 30 and 730),
  followup_days int not null default 30 check (followup_days between 1 and 180),
  conversion_days int not null default 90 check (conversion_days between 15 and 365),
  client_window_days int not null default 30 check (client_window_days between 7 and 180),
  min_opportunities int not null default 5 check (min_opportunities between 1 and 100),
  base_limit int not null default 6 check (base_limit between 1 and 50),
  medium_limit int not null default 4 check (medium_limit between 1 and 50),
  low_limit int not null default 2 check (low_limit between 1 and 50),
  medium_conversion_pct numeric(5,2) not null default 40 check (medium_conversion_pct between 0 and 100),
  low_conversion_pct numeric(5,2) not null default 20 check (low_conversion_pct between 0 and 100),
  medium_roi numeric(8,2) not null default 3 check (medium_roi >= 0),
  low_roi numeric(8,2) not null default 1 check (low_roi >= 0),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.sales_reps(id) on delete set null,
  check (low_limit <= medium_limit and medium_limit <= base_limit),
  check (low_conversion_pct <= medium_conversion_pct),
  check (low_roi <= medium_roi)
);

insert into public.sample_conversion_settings(id) values (true)
on conflict (id) do nothing;

alter table public.sample_conversion_settings enable row level security;
drop policy if exists sample_conversion_settings_select on public.sample_conversion_settings;
create policy sample_conversion_settings_select on public.sample_conversion_settings
  for select to authenticated using ((select public.current_rep_id()) is not null);
drop policy if exists sample_conversion_settings_admin on public.sample_conversion_settings;
create policy sample_conversion_settings_admin on public.sample_conversion_settings
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
grant select, update on public.sample_conversion_settings to authenticated;

create or replace function public.tg_sample_conversion_settings_touch()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.updated_at := now();
  new.updated_by := public.current_rep_id();
  return new;
end;
$$;

drop trigger if exists trg_sample_conversion_settings_touch on public.sample_conversion_settings;
create trigger trg_sample_conversion_settings_touch
  before update on public.sample_conversion_settings
  for each row execute function public.tg_sample_conversion_settings_touch();

create table if not exists public.sample_conversion_events (
  id uuid primary key default gen_random_uuid(),
  source_type text not null check (source_type in ('bank_take','direct_request')),
  source_id uuid not null,
  product_id uuid references public.products(id) on delete restrict not null,
  account_id uuid references public.accounts(id) on delete cascade not null,
  sales_rep_id uuid references public.sales_reps(id) on delete restrict not null,
  sample_date date not null,
  quantity numeric(10,2) not null check (quantity > 0),
  unit_cost numeric(12,2) not null check (unit_cost >= 0),
  cost_estimated boolean not null default false,
  sample_cost numeric(14,2) generated always as (round(quantity * unit_cost, 2)) stored,
  follow_up_status text not null default 'pendiente'
    check (follow_up_status in ('pendiente','contactado','interesado','sin_interes')),
  follow_up_notes text,
  next_follow_up_date date,
  followed_up_at timestamptz,
  updated_by uuid references public.sales_reps(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_type, source_id, product_id, account_id)
);

create index if not exists idx_sample_conversion_rep_date
  on public.sample_conversion_events(sales_rep_id, sample_date desc);
create index if not exists idx_sample_conversion_account_product
  on public.sample_conversion_events(account_id, product_id, sample_date desc);
create index if not exists idx_sample_conversion_followup
  on public.sample_conversion_events(next_follow_up_date)
  where next_follow_up_date is not null;

alter table public.sample_conversion_events enable row level security;
drop policy if exists sample_conversion_events_select on public.sample_conversion_events;
create policy sample_conversion_events_select on public.sample_conversion_events
  for select to authenticated using (
    (select public.can_read_all()) or sales_rep_id = (select public.current_rep_id())
  );
drop policy if exists sample_conversion_events_update on public.sample_conversion_events;
create policy sample_conversion_events_update on public.sample_conversion_events
  for update to authenticated
  using ((select public.is_admin()) or sales_rep_id = (select public.current_rep_id()))
  with check ((select public.is_admin()) or sales_rep_id = (select public.current_rep_id()));
grant select, update on public.sample_conversion_events to authenticated;

create or replace function public.tg_sample_conversion_touch()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.updated_at := now();
  if new.follow_up_status is distinct from old.follow_up_status
     or new.follow_up_notes is distinct from old.follow_up_notes then
    new.followed_up_at := now();
    new.updated_by := public.current_rep_id();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sample_conversion_touch on public.sample_conversion_events;
create trigger trg_sample_conversion_touch
  before update on public.sample_conversion_events
  for each row execute function public.tg_sample_conversion_touch();

-- Un movimiento "toma" con cliente se convierte en oportunidad medible.
create or replace function public.tg_sample_conversion_from_bank()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.kind = 'toma' and new.account_id is not null and new.product_id is not null then
    insert into public.sample_conversion_events(
      source_type, source_id, product_id, account_id, sales_rep_id, sample_date,
      quantity, unit_cost, cost_estimated
    )
    select 'bank_take', new.id, new.product_id, new.account_id,
           coalesce(new.taken_by, new.created_by), new.created_at::date,
           abs(new.quantity), coalesce(p.sample_unit_cost, p.base_price),
           p.sample_unit_cost is null
    from public.products p
    where p.id = new.product_id and coalesce(new.taken_by, new.created_by) is not null
    on conflict (source_type, source_id, product_id, account_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sample_conversion_from_bank on public.sample_bank_movements;
create trigger trg_sample_conversion_from_bank
  after insert on public.sample_bank_movements
  for each row execute function public.tg_sample_conversion_from_bank();

-- Los envíos directos se registran cuando el admin confirma la entrega.
create or replace function public.tg_sample_conversion_from_direct()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'entregada'
     and old.status is distinct from 'entregada'
     and coalesce(new.ship_to_client, false)
     and new.account_id is not null then
    insert into public.sample_conversion_events(
      source_type, source_id, product_id, account_id, sales_rep_id, sample_date,
      quantity, unit_cost, cost_estimated
    )
    select 'direct_request', new.id, i.product_id, new.account_id, new.sales_rep_id,
           coalesce(new.ship_date, current_date), sum(i.quantity),
           coalesce(p.sample_unit_cost, p.base_price), p.sample_unit_cost is null
    from public.sample_request_items i
    join public.products p on p.id = i.product_id
    where i.request_id = new.id and i.quantity > 0
    group by i.product_id, p.sample_unit_cost, p.base_price
    on conflict (source_type, source_id, product_id, account_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sample_conversion_from_direct on public.sample_requests;
create trigger trg_sample_conversion_from_direct
  after update on public.sample_requests
  for each row execute function public.tg_sample_conversion_from_direct();

-- Histórico medible: tomas que sí indicaron cliente.
insert into public.sample_conversion_events(
  source_type, source_id, product_id, account_id, sales_rep_id, sample_date,
  quantity, unit_cost, cost_estimated
)
select 'bank_take', m.id, m.product_id, m.account_id, coalesce(m.taken_by, m.created_by),
       m.created_at::date, abs(m.quantity), coalesce(p.sample_unit_cost, p.base_price),
       p.sample_unit_cost is null
from public.sample_bank_movements m
join public.products p on p.id = m.product_id
where m.kind = 'toma' and m.account_id is not null
  and coalesce(m.taken_by, m.created_by) is not null
on conflict (source_type, source_id, product_id, account_id) do nothing;

-- Histórico medible: solicitudes enviadas directamente y ya entregadas.
insert into public.sample_conversion_events(
  source_type, source_id, product_id, account_id, sales_rep_id, sample_date,
  quantity, unit_cost, cost_estimated
)
select 'direct_request', r.id, i.product_id, r.account_id, r.sales_rep_id,
       coalesce(r.ship_date, r.reviewed_at::date, r.created_at::date), sum(i.quantity),
       coalesce(p.sample_unit_cost, p.base_price), p.sample_unit_cost is null
from public.sample_requests r
join public.sample_request_items i on i.request_id = r.id
join public.products p on p.id = i.product_id
where r.status = 'entregada' and coalesce(r.ship_to_client, false)
  and r.account_id is not null and i.quantity > 0
group by r.id, i.product_id, r.account_id, r.sales_rep_id, r.ship_date,
         r.reviewed_at, r.created_at, p.sample_unit_cost, p.base_price
on conflict (source_type, source_id, product_id, account_id) do nothing;

-- Desempeño maduro: oportunidades únicas cliente × vino. La inversión sí
-- suma todas las botellas; el ingreso se atribuye una sola vez a la primera
-- muestra del par para no duplicar ventas cuando hubo muestras repetidas.
create or replace function public.sample_rep_performance(p_rep uuid)
returns table (
  opportunities bigint,
  converted bigint,
  sold bigint,
  conversion_pct numeric,
  investment numeric,
  revenue numeric,
  roi numeric
)
language sql stable security invoker set search_path = '' as $$
  with cfg as (
    select * from public.sample_conversion_settings where id = true
  ),
  spend as (
    select coalesce(sum(e.sample_cost), 0) as investment
    from public.sample_conversion_events e, cfg
    where e.sales_rep_id = p_rep
      and e.sample_date >= current_date - cfg.analysis_days
  ),
  mature as (
    select distinct on (e.account_id, e.product_id)
      e.account_id, e.product_id, e.sample_date, p.sku, p.codigo_contpaqi
    from public.sample_conversion_events e
    join public.products p on p.id = e.product_id
    cross join cfg
    where e.sales_rep_id = p_rep
      and e.sample_date >= current_date - cfg.analysis_days
      and e.sample_date <= current_date - cfg.followup_days
    order by e.account_id, e.product_id, e.sample_date
  ),
  outcomes as (
    select m.*,
      exists (
        select 1 from public.account_products ap, cfg
        where ap.account_id = m.account_id and ap.product_id = m.product_id
          and ap.status = 'encartado'
          and coalesce(ap.since, ap.created_at::date) between m.sample_date and m.sample_date + cfg.conversion_days
      ) as encarted,
      coalesce((
        select sum(msi.neto_desc)
        from public.monthly_sales ms
        join public.monthly_sales_items msi on msi.monthly_sale_id = ms.id
        cross join cfg
        where ms.account_id = m.account_id
          and ms.period between date_trunc('month', m.sample_date)::date
                            and date_trunc('month', m.sample_date + cfg.conversion_days)::date
          and msi.codigo is not null
          and (msi.codigo = m.sku or msi.codigo = m.codigo_contpaqi)
      ), 0) as sale_revenue
    from mature m
  )
  select
    count(*)::bigint,
    count(*) filter (where encarted or sale_revenue > 0)::bigint,
    count(*) filter (where sale_revenue > 0)::bigint,
    case when count(*) > 0 then round(100.0 * count(*) filter (where encarted or sale_revenue > 0) / count(*), 2) else 0 end,
    round((select investment from spend), 2),
    round(coalesce(sum(sale_revenue), 0), 2),
    case when (select investment from spend) > 0
      then round(coalesce(sum(sale_revenue), 0) / (select investment from spend), 2)
      else 0 end
  from outcomes;
$$;

create or replace function public.sample_dynamic_client_limit(p_rep uuid)
returns int language plpgsql stable security invoker set search_path = '' as $$
declare
  cfg public.sample_conversion_settings%rowtype;
  perf record;
begin
  select * into cfg from public.sample_conversion_settings where id = true;
  select * into perf from public.sample_rep_performance(p_rep);
  if coalesce(perf.opportunities, 0) < cfg.min_opportunities then return cfg.base_limit; end if;
  if perf.conversion_pct < cfg.low_conversion_pct or perf.roi < cfg.low_roi then return cfg.low_limit; end if;
  if perf.conversion_pct < cfg.medium_conversion_pct or perf.roi < cfg.medium_roi then return cfg.medium_limit; end if;
  return cfg.base_limit;
end;
$$;

revoke execute on function public.sample_rep_performance(uuid) from public, anon;
grant execute on function public.sample_rep_performance(uuid) to authenticated;
revoke execute on function public.sample_dynamic_client_limit(uuid) from public, anon;
grant execute on function public.sample_dynamic_client_limit(uuid) to authenticated;

-- El candado existente de solicitudes usa ahora el límite dinámico.
create or replace function public.tg_sample_client_cap()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_cap int;
  v_days int;
  v_this numeric;
  v_prev numeric;
  v_sin_compra text;
begin
  if new.status <> 'enviada' then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'enviada' then return new; end if;
  if public.is_admin() then return new; end if;
  if new.account_id is null then return new; end if;

  if new.training_people is not null then
    select string_agg(distinct i.product_name, ', ') into v_sin_compra
    from public.sample_request_items i
    where i.request_id = new.id
      and (i.product_id is null or not public.account_bought_product(new.account_id, i.product_id));
    if v_sin_compra is not null then
      raise exception
        'La capacitación es para vinos que el cliente ya compra. Sin compra previa registrada: %.',
        v_sin_compra using errcode = 'check_violation';
    end if;
    return new;
  end if;

  v_cap := public.sample_dynamic_client_limit(new.sales_rep_id);
  select client_window_days into v_days from public.sample_conversion_settings where id = true;
  select coalesce(sum(quantity), 0) into v_this
    from public.sample_request_items where request_id = new.id;
  v_prev := public.sample_bottles_to_account(new.account_id, v_days, new.id);

  if v_this + v_prev > v_cap then
    raise exception
      'Tu límite actual es % botella(s) por cliente cada % días según tu conversión y retorno. Este cliente lleva % y con esta solicitud serían %.',
      v_cap, v_days, v_prev, v_this + v_prev using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

-- Tomar del banco exige cliente y respeta el mismo límite dinámico.
create or replace function public.sample_bank_take(
  p_product uuid,
  p_region text,
  p_qty numeric,
  p_note text default null,
  p_location text default null,
  p_account uuid default null
)
returns numeric language plpgsql security definer set search_path = '' as $$
declare
  v_rep uuid;
  v_region text;
  v_avail numeric;
  v_used numeric;
  v_limit int;
  v_days int;
begin
  v_rep := public.current_rep_id();
  if v_rep is null then raise exception 'No autenticado'; end if;
  if p_account is null then raise exception 'Selecciona el cliente para medir la conversión de la muestra'; end if;
  select primary_region into v_region from public.sales_reps where id = v_rep;
  if not public.is_admin() and (v_region is distinct from p_region) then
    raise exception 'Solo puedes tomar muestras de tu zona';
  end if;
  if p_qty is null or p_qty <= 0 then raise exception 'Cantidad inválida'; end if;

  if not public.is_admin() then
    v_limit := public.sample_dynamic_client_limit(v_rep);
    select client_window_days into v_days from public.sample_conversion_settings where id = true;
    select coalesce(sum(quantity), 0) into v_used
    from public.sample_conversion_events
    where sales_rep_id = v_rep and account_id = p_account
      and sample_date >= current_date - v_days;
    if v_used + p_qty > v_limit then
      raise exception
        'Tu límite actual es % botella(s) por cliente cada % días según tu conversión y retorno. Este cliente ya lleva %.',
        v_limit, v_days, v_used using errcode = 'check_violation';
    end if;
  end if;

  select coalesce(sum(quantity), 0) into v_avail
  from public.sample_bank_movements
  where product_id = p_product
    and region is not distinct from p_region
    and location is not distinct from p_location;
  if v_avail < p_qty then
    raise exception 'No hay suficientes botellas en el banco (disponibles: %)', v_avail using errcode = 'check_violation';
  end if;
  insert into public.sample_bank_movements(
    product_id, product_name, supplier, region, location, quantity, kind,
    taken_by, account_id, notes, created_by
  )
  select p_product, p.name, p.supplier, p_region, p_location, -p_qty, 'toma',
         v_rep, p_account, p_note, v_rep
  from public.products p where p.id = p_product;
  return v_avail - p_qty;
end;
$$;

revoke execute on function public.sample_bank_take(uuid, text, numeric, text, text, uuid) from public, anon;
grant execute on function public.sample_bank_take(uuid, text, numeric, text, text, uuid) to authenticated;
