-- =====================================================================
-- Banco de muestras por zona
-- =====================================================================
-- Cuando una solicitud de muestra se AUTORIZA (status 'aprobada'), sus botellas
-- entran a un "banco de muestras" de la ZONA del vendedor que la pidió
-- (sales_reps.primary_region). Los vendedores ven lo disponible en su zona y
-- pueden "tomar" botellas (descuenta inventario). Es una bitácora: +ingreso al
-- aprobar, -toma al usar; el disponible = suma de movimientos.
-- =====================================================================

create table if not exists public.sample_bank_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.products(id) on delete cascade not null,
  product_name text not null,
  supplier text,
  region text,                                  -- zona (primary_region del vendedor)
  quantity numeric(10,2) not null,              -- + ingreso, - toma
  kind text not null check (kind in ('ingreso', 'toma')),
  source_request_id uuid references public.sample_requests(id) on delete set null,
  taken_by uuid references public.sales_reps(id) on delete set null,
  notes text,
  created_by uuid references public.sales_reps(id) on delete set null,
  created_at timestamptz default now()
);
create index if not exists idx_sample_bank_product_region on public.sample_bank_movements(product_id, region);
create index if not exists idx_sample_bank_region on public.sample_bank_movements(region);

alter table public.sample_bank_movements enable row level security;

-- Lectura: admin/contador ven todo; cada vendedor ve los movimientos de SU zona.
drop policy if exists sample_bank_select on public.sample_bank_movements;
create policy sample_bank_select on public.sample_bank_movements
  for select using (
    public.can_read_all()
    or region is not distinct from (select primary_region from public.sales_reps where id = public.current_rep_id())
  );
-- Escritura directa: solo admin. Las tomas pasan por el RPC (security definer).
drop policy if exists sample_bank_admin_write on public.sample_bank_movements;
create policy sample_bank_admin_write on public.sample_bank_movements
  for all using (public.is_admin()) with check (public.is_admin());

-- Disponibilidad agregada por (vino, zona). security_invoker => respeta RLS.
create or replace view public.v_sample_bank with (security_invoker = on) as
select
  product_id,
  max(product_name) as product_name,
  max(supplier)     as supplier,
  region,
  sum(quantity)                                            as available,
  coalesce(sum(quantity) filter (where kind = 'ingreso'), 0)  as ingresado,
  coalesce(-sum(quantity) filter (where kind = 'toma'), 0)    as tomado
from public.sample_bank_movements
group by product_id, region;
grant select on public.v_sample_bank to authenticated, anon;

-- Surtir el banco al AUTORIZAR (transición a 'aprobada').
create or replace function public.tg_sample_bank_on_approve()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_region text;
begin
  if new.status = 'aprobada' and tg_op = 'UPDATE' and old.status is distinct from 'aprobada' then
    select primary_region into v_region from public.sales_reps where id = new.sales_rep_id;
    insert into public.sample_bank_movements(product_id, product_name, supplier, region, quantity, kind, source_request_id, created_by)
    select i.product_id, i.product_name, i.supplier, v_region, i.quantity, 'ingreso', new.id, new.reviewed_by
    from public.sample_request_items i
    where i.request_id = new.id and i.product_id is not null and i.quantity > 0;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_sample_bank_on_approve on public.sample_requests;
create trigger trg_sample_bank_on_approve
  after update on public.sample_requests
  for each row execute function public.tg_sample_bank_on_approve();

-- Tomar botellas del banco (valida zona y existencias; descuenta).
create or replace function public.sample_bank_take(p_product uuid, p_region text, p_qty numeric, p_note text default null)
returns numeric language plpgsql security definer set search_path = public as $$
declare v_rep uuid; v_region text; v_avail numeric;
begin
  v_rep := public.current_rep_id();
  if v_rep is null then raise exception 'No autenticado'; end if;
  select primary_region into v_region from public.sales_reps where id = v_rep;
  if not public.is_admin() and (v_region is distinct from p_region) then
    raise exception 'Solo puedes tomar muestras de tu zona';
  end if;
  if p_qty is null or p_qty <= 0 then raise exception 'Cantidad inválida'; end if;
  select coalesce(sum(quantity), 0) into v_avail
  from public.sample_bank_movements
  where product_id = p_product and region is not distinct from p_region;
  if v_avail < p_qty then
    raise exception 'No hay suficientes botellas en el banco (disponibles: %)', v_avail using errcode = 'check_violation';
  end if;
  insert into public.sample_bank_movements(product_id, product_name, supplier, region, quantity, kind, taken_by, notes, created_by)
  select p_product, p.name, p.supplier, p_region, -p_qty, 'toma', v_rep, p_note, v_rep
  from public.products p where p.id = p_product;
  return v_avail - p_qty;
end;
$$;

-- Backfill: solicitudes ya 'aprobada' (autorizadas pero aún disponibles).
insert into public.sample_bank_movements(product_id, product_name, supplier, region, quantity, kind, source_request_id, created_by)
select i.product_id, i.product_name, i.supplier, sr.primary_region, i.quantity, 'ingreso', r.id, r.reviewed_by
from public.sample_requests r
join public.sample_request_items i on i.request_id = r.id
left join public.sales_reps sr on sr.id = r.sales_rep_id
where r.status = 'aprobada' and i.product_id is not null and i.quantity > 0
  and not exists (
    select 1 from public.sample_bank_movements m
    where m.source_request_id = r.id and m.kind = 'ingreso'
  );
