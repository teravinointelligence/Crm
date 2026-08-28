-- Reportes de consumo/merma del banco de muestras.
--
-- Problema: cuando una botella del banco deja de existir físicamente sin una
-- "toma" normal (se consumió en un evento sin registrarse, se dañó o envejeció,
-- o regresó al almacén de venta), solo el admin puede regularizar el banco con
-- una liberación. Los vendedores no tienen cómo avisar desde el CRM y el banco
-- acumula botellas fantasma que luego bloquean solicitudes ("este vino ya está
-- en el banco de tu zona").
--
-- Flujo nuevo (mismo patrón que las solicitudes de cancelación de muestras):
--   1. El vendedor reporta desde el banco: qué botella, cuántas, por qué
--      (consumo con un cliente / merma / regresó al almacén) y una nota.
--   2. El admin aprueba o rechaza. Al aprobar se genera el movimiento real:
--      consumo → 'toma' (cuenta como usada, con cliente), merma y regreso →
--      'liberacion' (no cuenta como usada, ver migración 0103).
-- El banco no se mueve hasta que el admin decide.

create table if not exists public.sample_bank_reports (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  product_name text not null,
  region text,
  location text,
  quantity numeric(10,2) not null check (quantity > 0),
  kind text not null check (kind in ('consumo', 'merma', 'regreso_almacen')),
  account_id uuid references public.accounts(id) on delete set null,
  note text not null,
  status text not null default 'pendiente'
    check (status in ('pendiente', 'aprobado', 'rechazado')),
  reported_by uuid not null references public.sales_reps(id) on delete cascade,
  reported_at timestamptz not null default now(),
  decided_by uuid references public.sales_reps(id) on delete set null,
  decided_at timestamptz,
  decision_notes text,
  -- Movimiento del banco generado al aprobar (toma o liberación).
  movement_id uuid references public.sample_bank_movements(id) on delete set null
);

create index if not exists idx_sample_bank_reports_pending
  on public.sample_bank_reports (reported_at)
  where status = 'pendiente';
create index if not exists idx_sample_bank_reports_reported_by
  on public.sample_bank_reports (reported_by);
create index if not exists idx_sample_bank_reports_bucket
  on public.sample_bank_reports (product_id, region);

alter table public.sample_bank_reports enable row level security;

-- Lectura: admin/contador ven todo; el vendedor ve sus propios reportes.
drop policy if exists sample_bank_reports_select on public.sample_bank_reports;
create policy sample_bank_reports_select on public.sample_bank_reports
  for select to authenticated
  using (
    public.can_read_all()
    or reported_by = (select public.current_rep_id())
  );
-- Escritura solo por los RPCs (security definer); sin acceso directo.

revoke all on table public.sample_bank_reports from anon;
revoke all on table public.sample_bank_reports from authenticated;
grant select on table public.sample_bank_reports to authenticated;

-- ---------------------------------------------------------------------
-- Crear un reporte (vendedor de la zona, o admin).
-- ---------------------------------------------------------------------
create or replace function public.sample_bank_report_create(
  p_product uuid,
  p_region text,
  p_location text,
  p_kind text,
  p_qty numeric,
  p_account uuid default null,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rep uuid := public.current_rep_id();
  v_region text;
  v_avail numeric;
  v_pending numeric;
  v_note text := btrim(coalesce(p_note, ''));
  v_product_name text;
  v_id uuid;
begin
  if v_rep is null then raise exception 'No autenticado'; end if;
  if p_kind not in ('consumo', 'merma', 'regreso_almacen') then
    raise exception 'Tipo de reporte inválido';
  end if;
  if p_qty is null or p_qty <= 0 then raise exception 'Cantidad inválida'; end if;
  if char_length(v_note) < 5 then
    raise exception 'Escribe una nota de al menos 5 caracteres (qué pasó con la botella)';
  end if;
  if p_kind = 'consumo' and p_account is null then
    raise exception 'Para un consumo indica con qué cliente se usó la botella';
  end if;

  select primary_region into v_region from public.sales_reps where id = v_rep;
  if not public.is_admin() and (v_region is distinct from p_region) then
    raise exception 'Solo puedes reportar botellas del banco de tu zona';
  end if;

  select name into v_product_name from public.products where id = p_product;
  if not found then raise exception 'Producto no encontrado'; end if;

  select coalesce(sum(quantity), 0) into v_avail
  from public.sample_bank_movements
  where product_id = p_product
    and region is not distinct from p_region
    and location is not distinct from p_location;

  -- Lo ya reportado y aún sin decidir del mismo bucket también compromete
  -- botellas: evita reportar más de lo que existe.
  select coalesce(sum(quantity), 0) into v_pending
  from public.sample_bank_reports
  where product_id = p_product
    and region is not distinct from p_region
    and location is not distinct from p_location
    and status = 'pendiente';

  if v_avail - v_pending < p_qty then
    raise exception
      'No hay suficientes botellas para reportar (disponibles: %, ya reportadas sin decidir: %)',
      v_avail, v_pending
      using errcode = 'check_violation';
  end if;

  insert into public.sample_bank_reports(
    product_id, product_name, region, location, quantity, kind, account_id, note, reported_by
  ) values (
    p_product, v_product_name, p_region, p_location, p_qty, p_kind, p_account,
    left(v_note, 2000), v_rep
  )
  returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function public.sample_bank_report_create(uuid, text, text, text, numeric, uuid, text)
  from public, anon;
grant execute on function public.sample_bank_report_create(uuid, text, text, text, numeric, uuid, text)
  to authenticated;

-- ---------------------------------------------------------------------
-- Decidir un reporte (admin). Al aprobar se genera el movimiento del banco.
-- ---------------------------------------------------------------------
create or replace function public.sample_bank_report_decide(
  p_report uuid,
  p_decision text,
  p_notes text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rep uuid := public.current_rep_id();
  r public.sample_bank_reports%rowtype;
  v_avail numeric;
  v_supplier text;
  v_movement uuid;
begin
  if v_rep is null then raise exception 'No autenticado'; end if;
  if not public.is_admin() then raise exception 'Solo admin puede decidir reportes del banco'; end if;
  if p_decision not in ('aprobado', 'rechazado') then raise exception 'Decisión inválida'; end if;

  select * into r from public.sample_bank_reports where id = p_report for update;
  if not found then raise exception 'Reporte no encontrado'; end if;
  if r.status <> 'pendiente' then raise exception 'Este reporte ya fue decidido (%)', r.status; end if;

  if p_decision = 'aprobado' then
    -- Serializa contra otras salidas del mismo bucket antes de validar.
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        r.product_id::text || '|' || coalesce(r.region, '') || '|' || coalesce(r.location, ''),
        0
      )
    );

    select coalesce(sum(quantity), 0) into v_avail
    from public.sample_bank_movements
    where product_id = r.product_id
      and region is not distinct from r.region
      and location is not distinct from r.location;
    if v_avail < r.quantity then
      raise exception 'Ya no hay suficientes botellas en el banco (disponibles: %)', v_avail
        using errcode = 'check_violation';
    end if;

    select supplier into v_supplier from public.products where id = r.product_id;

    if r.kind = 'consumo' then
      -- Consumo real con cliente: cuenta como toma del vendedor que reportó.
      insert into public.sample_bank_movements(
        product_id, product_name, supplier, region, location, quantity, kind,
        taken_by, account_id, notes, created_by
      ) values (
        r.product_id, r.product_name, v_supplier, r.region, r.location, -r.quantity, 'toma',
        r.reported_by, r.account_id, 'Reporte de consumo aprobado: ' || r.note, v_rep
      )
      returning id into v_movement;
    else
      -- Merma o regreso al almacén: sale del banco sin contar como usada.
      insert into public.sample_bank_movements(
        product_id, product_name, supplier, region, location, quantity, kind, notes, created_by
      ) values (
        r.product_id, r.product_name, v_supplier, r.region, r.location, -r.quantity, 'liberacion',
        case when r.kind = 'merma' then 'Merma reportada: ' else 'Regresó al almacén: ' end || r.note,
        v_rep
      )
      returning id into v_movement;
    end if;
  end if;

  update public.sample_bank_reports set
    status = p_decision,
    decided_by = v_rep,
    decided_at = now(),
    decision_notes = nullif(btrim(coalesce(p_notes, '')), ''),
    movement_id = v_movement
  where id = p_report;
end;
$$;

revoke execute on function public.sample_bank_report_decide(uuid, text, text)
  from public, anon;
grant execute on function public.sample_bank_report_decide(uuid, text, text)
  to authenticated;
