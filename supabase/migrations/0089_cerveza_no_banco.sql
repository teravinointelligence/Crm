-- =====================================================================
-- Cervezas: excluir del banco de muestras
-- =====================================================================
-- Las cervezas abiertas no se pueden reutilizar, por lo que no deben
-- acumularse en el banco. Al aprobar una solicitud que incluye cervezas,
-- esas botellas se omiten del ingreso al banco.
-- =====================================================================

-- Las cervezas tampoco aplican la regla de "3 clientes antes de volver a pedir"
-- porque una vez abiertas no se pueden reutilizar.
create or replace function public.rep_locked_sample_products()
returns table(product_id uuid)
language sql stable security definer set search_path = 'public' as $$
  select distinct i.product_id
  from public.sample_requests r
  join public.sample_request_items i on i.request_id = r.id
  join public.products p on p.id = i.product_id
  where r.sales_rep_id = public.current_rep_id()
    and r.status in ('enviada', 'aprobada', 'entregada')
    and i.product_id is not null
    and coalesce(p.category, '') <> 'cerveza'
    and public.sample_distinct_clients(r.id) < 3;
$$;

-- Trigger BD: cervezas no se bloquean por "banco lleno" (tg_sample_in_bank).
create or replace function public.tg_sample_in_bank()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v_region text; v_avail numeric; v_category text;
begin
  if new.product_id is null then return new; end if;
  if public.is_admin() then return new; end if;
  select coalesce(category, '') into v_category from public.products where id = new.product_id;
  if v_category = 'cerveza' then return new; end if;
  select sr.primary_region into v_region
  from public.sample_requests r
  join public.sales_reps sr on sr.id = r.sales_rep_id
  where r.id = new.request_id;
  select coalesce(sum(quantity), 0) into v_avail
  from public.sample_bank_movements
  where product_id = new.product_id
    and region is not distinct from v_region;
  if v_avail > 0 then
    raise exception 'Este vino ya está en el banco de muestras de tu zona; tómala de ahí antes de pedir otra.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

-- Trigger BD: cervezas no se bloquean por la regla de 3 clientes (tg_sample_no_reuse).
create or replace function public.tg_sample_no_reuse()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v_rep uuid; v_open int; v_category text;
begin
  if new.product_id is null then return new; end if;
  if public.is_admin() then return new; end if;
  select coalesce(category, '') into v_category from public.products where id = new.product_id;
  if v_category = 'cerveza' then return new; end if;
  select sales_rep_id into v_rep from public.sample_requests where id = new.request_id;
  select count(*) into v_open
  from public.sample_requests r2
  join public.sample_request_items i2 on i2.request_id = r2.id
  where r2.sales_rep_id = v_rep
    and r2.id <> new.request_id
    and r2.status in ('enviada', 'aprobada', 'entregada')
    and i2.product_id = new.product_id
    and public.sample_distinct_clients(r2.id) < 3;
  if v_open > 0 then
    raise exception 'Ya tienes una muestra de este vino en uso; complétala con 3 clientes distintos antes de volver a pedirla.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create or replace function public.tg_sample_bank_on_approve()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_region text;
begin
  if new.status = 'aprobada' and tg_op = 'UPDATE' and old.status is distinct from 'aprobada' then
    select primary_region into v_region from public.sales_reps where id = new.sales_rep_id;
    insert into public.sample_bank_movements(product_id, product_name, supplier, region, quantity, kind, source_request_id, created_by)
    select i.product_id, i.product_name, i.supplier, v_region, i.quantity, 'ingreso', new.id, new.reviewed_by
    from public.sample_request_items i
    join public.products p on p.id = i.product_id
    where i.request_id = new.id
      and i.product_id is not null
      and i.quantity > 0
      and coalesce(p.category, '') <> 'cerveza';   -- cervezas no entran al banco
  end if;
  return new;
end;
$$;
