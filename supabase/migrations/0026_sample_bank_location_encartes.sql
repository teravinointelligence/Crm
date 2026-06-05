-- =====================================================================
-- Banco de muestras: ubicación física (bodega) + medición de encartes
-- =====================================================================
-- Extiende el banco (0025) con dos cosas:
--  1) `location`: bodega física donde se resguarda la botella (San José, La
--     Paz, Vallarta, Tijuana). Dimensión distinta de la zona de ventas.
--  2) `account_id` en las tomas: a qué cuenta fue la muestra, para medir el
--     % de encartes (muestras tomadas que terminan 'encartado' en la cuenta).
-- =====================================================================

alter table public.sample_bank_movements add column if not exists location text;
alter table public.sample_bank_movements
  add column if not exists account_id uuid references public.accounts(id) on delete set null;
create index if not exists idx_sample_bank_location on public.sample_bank_movements(location);
create index if not exists idx_sample_bank_account on public.sample_bank_movements(account_id);

-- Disponibilidad agregada por (vino, zona, bodega). security_invoker => respeta RLS.
-- (drop + create porque agregamos `location` en medio de las columnas existentes)
drop view if exists public.v_sample_bank;
create view public.v_sample_bank with (security_invoker = on) as
select
  product_id,
  max(product_name) as product_name,
  max(supplier)     as supplier,
  region,
  location,
  sum(quantity)                                              as available,
  coalesce(sum(quantity) filter (where kind = 'ingreso'), 0) as ingresado,
  coalesce(-sum(quantity) filter (where kind = 'toma'), 0)   as tomado
from public.sample_bank_movements
group by product_id, region, location;
grant select on public.v_sample_bank to authenticated, anon;

-- Tomar botellas del banco. Ahora desde una BODEGA concreta y, opcionalmente,
-- para una CUENTA (para poder medir encartes). Valida zona y existencias del
-- bucket (vino, zona, bodega).
drop function if exists public.sample_bank_take(uuid, text, numeric, text);
create or replace function public.sample_bank_take(
  p_product uuid,
  p_region text,
  p_qty numeric,
  p_note text default null,
  p_location text default null,
  p_account uuid default null
)
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
  where product_id = p_product
    and region is not distinct from p_region
    and location is not distinct from p_location;
  if v_avail < p_qty then
    raise exception 'No hay suficientes botellas en el banco (disponibles: %)', v_avail using errcode = 'check_violation';
  end if;
  insert into public.sample_bank_movements(product_id, product_name, supplier, region, location, quantity, kind, taken_by, account_id, notes, created_by)
  select p_product, p.name, p.supplier, p_region, p_location, -p_qty, 'toma', v_rep, p_account, p_note, v_rep
  from public.products p where p.id = p_product;
  return v_avail - p_qty;
end;
$$;

-- Reasignar la bodega de un stock (vino, zona): relabela sus movimientos. Admin.
create or replace function public.sample_bank_set_location(
  p_product uuid,
  p_region text,
  p_from_location text,
  p_to_location text
)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Solo admin'; end if;
  update public.sample_bank_movements
     set location = p_to_location
   where product_id = p_product
     and region is not distinct from p_region
     and location is not distinct from p_from_location;
end;
$$;
