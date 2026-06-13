-- =====================================================================
-- Incentivos por ENCARTES (carrera de cupos) + seed Bogle 2026
-- =====================================================================
-- Segunda mecánica del módulo de incentivos: contar CLIENTES DISTINTOS
-- con la marca colocada (encartes), meta única y cupos para los primeros
-- N en llegar — conviviendo con la mecánica de puntos (Gerard Bertrand)
-- sin tocar su cálculo. Todo lo de esta migración es ADITIVO y
-- retrocompatible: los programas existentes quedan tipo='puntos' y su
-- comportamiento no cambia.
--
-- Realidad de datos (igual que GB): el detalle por producto vive en
-- monthly_sales(_items) a granularidad cliente+MES sin folio, y la
-- cobranza se aproxima a "cuenta+mes 100% pagado". Por decisión de
-- dirección (13-jun-2026) el periodo Bogle se maneja por MESES COMPLETOS
-- (jun–sep 2026). La "fecha de detección" que ordena la carrera es la
-- fecha del pago que liquidó el mes del cliente (max payment_date), con
-- desempate por hora de captura del pago — así una validación tardía del
-- admin NO altera el orden de llegada.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Programas: tipo de mecánica + configuración de encartes
-- ---------------------------------------------------------------------
alter table public.incentive_programs
  add column if not exists tipo text not null default 'puntos'
    check (tipo in ('puntos','encartes')),
  add column if not exists meta_encartes int,
  add column if not exists max_ganadores int,
  add column if not exists requiere_validacion boolean not null default false,
  add column if not exists solo_clientes_nuevos boolean not null default false,
  add column if not exists estado text not null default 'activo'
    check (estado in ('activo','cerrado'));

-- ---------------------------------------------------------------------
-- 2. Mapeo de productos: categoría 'Marca' (identifica la marca del
--    programa sin asignar puntos; pts_por_botella queda en 0)
-- ---------------------------------------------------------------------
alter table public.incentive_product_rules
  drop constraint if exists incentive_product_rules_category_check;
alter table public.incentive_product_rules
  add constraint incentive_product_rules_category_check
  check (category in ('Íconos','Parcelarias','Châteaux','Premium','Volumen','Excluido','Marca'));

-- ---------------------------------------------------------------------
-- 3. Participantes: estatus de visa (solo informativo, editable por admin)
-- ---------------------------------------------------------------------
alter table public.incentive_participants
  add column if not exists visa_status text not null default 'sin_informacion'
    check (visa_status in ('vigente','en_tramite','sin_visa','sin_informacion'));

-- ---------------------------------------------------------------------
-- 4. INCENTIVE_PLACEMENTS — un renglón por encarte (vendedor × cliente)
-- ---------------------------------------------------------------------
create table if not exists public.incentive_placements (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.incentive_programs(id) on delete cascade,
  rep_id uuid not null references public.sales_reps(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  client_number text,
  client_name text,
  -- Mes de la PRIMERA venta de la marca dentro del periodo (cuenta+mes).
  period date not null,
  -- Fecha que ordena la carrera: el pago que liquidó ese cuenta+mes.
  fecha_deteccion date not null,
  deteccion_ts timestamptz,
  estado text not null default 'pendiente'
    check (estado in ('pendiente','validado','rechazado','en_revision')),
  evidencia_url text,
  validado_por uuid references public.sales_reps(id),
  validado_en timestamptz,
  notas text,
  created_at timestamptz not null default now(),
  -- Un cliente cuenta UNA vez por vendedor; un rechazado no se re-inserta
  -- (la detección hace ON CONFLICT DO NOTHING contra esta unique).
  unique (program_id, rep_id, account_id)
);
create index if not exists idx_incentive_placements_programa
  on public.incentive_placements (program_id, estado);

alter table public.incentive_placements enable row level security;

-- Lectura: el vendedor SOLO sus encartes; admin y contador todo.
drop policy if exists incentive_placements_select on public.incentive_placements;
create policy incentive_placements_select on public.incentive_placements
  for select using (
    rep_id = public.current_rep_id()
    or public.is_admin()
    or exists (select 1 from public.sales_reps sr
               where sr.auth_user_id = auth.uid() and sr.role = 'contador')
  );
-- Escritura directa: solo admin (validar/rechazar/notas). La detección
-- corre como security definer y la evidencia del vendedor entra por RPC.
drop policy if exists incentive_placements_admin on public.incentive_placements;
create policy incentive_placements_admin on public.incentive_placements
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------
-- 5. DETECCIÓN — crea candidatos 'pendiente' desde las ventas cobradas.
--    Idempotente (ON CONFLICT DO NOTHING): correrla N veces no duplica,
--    no toca validados/rechazados y no inserta si el programa cerró.
-- ---------------------------------------------------------------------
create or replace function public.detect_incentive_placements(p_program_id uuid default null)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted int := 0;
  v_batch int;
  prog record;
begin
  for prog in
    select * from incentive_programs
    where tipo = 'encartes' and active and estado = 'activo'
      and (p_program_id is null or id = p_program_id)
  loop
    with ventas_marca as (
      -- cliente+mes del periodo con la marca del programa vendida
      select ms.sales_rep_id, ms.account_id, ms.client_number, ms.client_name,
             ms.period, sum(i.cantidad) as botellas
      from monthly_sales ms
      join monthly_sales_items i on i.monthly_sale_id = ms.id
      join incentive_participants pa
        on pa.program_id = prog.id and pa.rep_id = ms.sales_rep_id
      where ms.period >= prog.start_date and ms.period <= prog.end_date
        and exists (
          select 1 from incentive_product_rules r
          where r.program_id = prog.id and r.category = 'Marca'
            and (r.codigo_contpaqi = upper(trim(i.codigo))
                 or (r.match_name_pattern is not null
                     and public.incentive_norm(i.producto_nombre) ~ r.match_name_pattern))
        )
        and not exists (
          select 1 from incentive_exclusions ex
          where ex.program_id = prog.id
            and (ex.account_id = ms.account_id
                 or (ex.client_number is not null and ex.client_number = ms.client_number))
        )
      group by 1,2,3,4,5
      having sum(i.cantidad) > 0
    ),
    elegibles as (
      -- Según require_paid del programa:
      --  · false (Bogle, decisión dirección 13-jun): basta la VENTA
      --    facturada del mes; el orden de carrera lo da la fecha de la
      --    primera factura del cliente en ese mes (respaldo: el mes).
      --  · true: además el cuenta+mes debe estar 100% pagado; el orden
      --    lo da el pago que lo liquidó.
      select v.*,
             case when prog.require_paid
               then coalesce(liq.fecha_pago, current_date)
               else coalesce(liq.fecha_fact, v.period) end as fecha_evento,
             case when prog.require_paid then liq.ts_pago else liq.ts_fact end as ts_evento
      from ventas_marca v
      cross join lateral (
        select max(p.payment_date) as fecha_pago, max(p.created_at) as ts_pago,
               min(inv.invoice_date) as fecha_fact, min(inv.created_at) as ts_fact,
               count(distinct inv.id) as n_facturas,
               count(distinct inv.id) filter (where inv.status <> 'pagada') as n_impagas
        from invoices inv
        left join payment_allocations pa2 on pa2.invoice_id = inv.id
        left join payments p on p.id = pa2.payment_id or p.invoice_id = inv.id
        where inv.account_id = v.account_id
          and inv.invoice_date >= v.period
          and inv.invoice_date < (v.period + interval '1 month')::date
      ) liq
      where (not prog.require_paid)
         or (liq.n_facturas > 0 and liq.n_impagas = 0)
    ),
    primera as (
      -- un cliente cuenta UNA vez: nos quedamos con su primer mes elegible
      select distinct on (sales_rep_id, account_id) *
      from elegibles
      order by sales_rep_id, account_id, period
    )
    insert into incentive_placements
      (program_id, rep_id, account_id, client_number, client_name,
       period, fecha_deteccion, deteccion_ts, estado)
    select prog.id, p.sales_rep_id, p.account_id, p.client_number, p.client_name,
           p.period, p.fecha_evento, p.ts_evento,
           case when prog.requiere_validacion then 'pendiente' else 'validado' end
    from primera p
    -- Mientras el encarte siga PENDIENTE, cada corrida recalcula su mes y
    -- fecha (la venta puede importarse antes que su factura de cartera y
    -- la fecha de respaldo debe corregirse al llegar el dato real). Al
    -- validarse/rechazarse se congela: la validación nunca altera el orden.
    on conflict (program_id, rep_id, account_id) do update
      set period = excluded.period,
          client_number = excluded.client_number,
          client_name = excluded.client_name,
          fecha_deteccion = excluded.fecha_deteccion,
          deteccion_ts = excluded.deteccion_ts
      where incentive_placements.estado = 'pendiente';

    get diagnostics v_batch = row_count;
    v_inserted := v_inserted + v_batch;
  end loop;
  return v_inserted;
end;
$$;

revoke all on function public.detect_incentive_placements(uuid) from anon, public;
grant execute on function public.detect_incentive_placements(uuid) to authenticated;

-- Disparadores: cuando una factura queda pagada y cuando se importan
-- ventas. La función sale barato si no hay programas de encartes activos.
create or replace function public.trg_detect_incentive_placements()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.detect_incentive_placements();
  return null;
end;
$$;

drop trigger if exists trg_incentive_placements_on_paid on public.invoices;
create trigger trg_incentive_placements_on_paid
  after update of status on public.invoices
  for each row
  when (new.status = 'pagada' and old.status is distinct from new.status)
  execute function public.trg_detect_incentive_placements();

drop trigger if exists trg_incentive_placements_on_ventas on public.monthly_sales_items;
create trigger trg_incentive_placements_on_ventas
  after insert on public.monthly_sales_items
  for each statement
  execute function public.trg_detect_incentive_placements();

-- También al importar cartera: en modo "facturado" (require_paid=false)
-- una factura nueva puede completar un encarte sin pasar por pagos.
drop trigger if exists trg_incentive_placements_on_invoice on public.invoices;
create trigger trg_incentive_placements_on_invoice
  after insert on public.invoices
  for each statement
  execute function public.trg_detect_incentive_placements();

-- ---------------------------------------------------------------------
-- 6. CARRERA — leaderboard agregado (sin detalle de clientes ajenos).
--    Lo pueden leer todos los autenticados: la carrera es pública para
--    el equipo. La visa solo la ve admin/contador/service role.
-- ---------------------------------------------------------------------
create or replace function public.get_incentive_race(p_program_id uuid)
returns table (
  rep_id uuid,
  rep_name text,
  validados int,
  pendientes int,
  fecha_meta date,
  ts_meta timestamptz,
  posicion int,
  es_ganador boolean,
  visa_status text
)
language sql
security definer
set search_path = public
as $$
  with prog as (
    select * from incentive_programs where id = p_program_id
  ),
  sees_visa as (
    select public.is_admin()
      or coalesce(auth.role() = 'service_role', false)
      or exists (select 1 from sales_reps sr
                 where sr.auth_user_id = auth.uid() and sr.role = 'contador') as v
  ),
  conteos as (
    select pa.rep_id, sr.full_name, pa.visa_status,
           count(pl.id) filter (where pl.estado = 'validado')::int as validados,
           count(pl.id) filter (where pl.estado in ('pendiente','en_revision'))::int as pendientes
    from incentive_participants pa
    join sales_reps sr on sr.id = pa.rep_id
    left join incentive_placements pl
      on pl.program_id = pa.program_id and pl.rep_id = pa.rep_id
    where pa.program_id = p_program_id
    group by pa.rep_id, sr.full_name, pa.visa_status
  ),
  -- Fecha en que cada vendedor completó la meta: la fecha_deteccion de su
  -- encarte VALIDADO número `meta_encartes` (ordenados por llegada).
  meta as (
    select c.rep_id, m.fecha_deteccion as fecha_meta, m.deteccion_ts as ts_meta
    from conteos c
    cross join prog
    left join lateral (
      select pl.fecha_deteccion, pl.deteccion_ts
      from incentive_placements pl
      where pl.program_id = p_program_id and pl.rep_id = c.rep_id
        and pl.estado = 'validado'
      order by pl.fecha_deteccion, pl.deteccion_ts nulls last
      offset greatest(coalesce(prog.meta_encartes,10) - 1, 0) limit 1
    ) m on c.validados >= coalesce(prog.meta_encartes,10)
  ),
  orden as (
    select c.*, m.fecha_meta, m.ts_meta,
           case when m.fecha_meta is not null then
             row_number() over (
               partition by (m.fecha_meta is not null)
               order by m.fecha_meta, m.ts_meta nulls last, c.validados desc
             )::int
           end as posicion
    from conteos c
    left join meta m on m.rep_id = c.rep_id
  )
  select o.rep_id, o.full_name, o.validados, o.pendientes,
         o.fecha_meta, o.ts_meta, o.posicion,
         coalesce(o.posicion <= (select coalesce(max_ganadores, 2) from prog), false),
         case when (select v from sees_visa) then o.visa_status end
  from orden o
  order by o.posicion nulls last, o.validados desc, o.pendientes desc, o.full_name;
$$;

revoke all on function public.get_incentive_race(uuid) from anon, public;
grant execute on function public.get_incentive_race(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 7. EVIDENCIA — el vendedor adjunta evidencia a SU encarte pendiente.
--    (RPC en vez de policy de UPDATE para que no pueda tocar estado,
--    fechas ni el encarte de otro.)
-- ---------------------------------------------------------------------
create or replace function public.set_placement_evidence(p_placement_id uuid, p_url text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update incentive_placements
  set evidencia_url = p_url
  where id = p_placement_id
    and estado in ('pendiente','en_revision')
    and (rep_id = public.current_rep_id() or public.is_admin());
  if not found then
    raise exception 'Encarte no encontrado, ya resuelto, o sin permiso';
  end if;
end;
$$;

revoke all on function public.set_placement_evidence(uuid, text) from anon, public;
grant execute on function public.set_placement_evidence(uuid, text) to authenticated;

-- =====================================================================
-- SEED — Bogle 2026 · Viaje a California (carrera de encartes)
-- =====================================================================
do $$
declare
  v_program uuid;
  v_321 uuid;
begin
  select id into v_program from incentive_programs where name = 'Bogle 2026 · Viaje a California';
  if v_program is null then
    insert into incentive_programs
      (name, provider, start_date, end_date, active, require_paid, tipo,
       meta_encartes, max_ganadores, requiere_validacion, solo_clientes_nuevos, estado, notes)
    values (
      'Bogle 2026 · Viaje a California', 'Bogle Family Vineyards',
      -- require_paid=false: cuenta la VENTA facturada, sin esperar cobro
      -- (decisión de dirección 13-jun-2026).
      '2026-06-01', '2026-09-30', true, false, 'encartes',
      10, 2, true, false, 'activo',
      'Carrera de encartes: los PRIMEROS 2 vendedores con 10 clientes distintos comprando Bogle (venta facturada, sin esperar cobro) ganan viaje todo pagado a Bogle Family Vineyards, Clarksburg, California. Periodo por meses completos jun–sep 2026 (decisión de dirección 13-jun: las ventas no tienen día, solo mes). El orden de llegada lo da la fecha de la primera factura del mes que completa el encarte 10. Requisito para viajar: visa estadounidense vigente.'
    )
    returning id into v_program;
  end if;

  -- Participantes: los 5 vendedores (NO Sabrina, NO Ivan)
  insert into incentive_participants (program_id, rep_id)
  select v_program, sr.id from sales_reps sr
  where sr.email in ('yamile@teravino.com','andra@teravino.com','citlali@teravino.com',
                     'emmanuel@teravino.com','felix@teravino.com')
  on conflict (program_id, rep_id) do nothing;

  -- Productos Bogle: patrón sobre nombre normalizado (cubre los 5 códigos
  -- CONTPAQ vistos en ventas — BOGLESUABL, BOGLEPINOT, BOGLEROSE,
  -- BOGCABSUA, BOGCHARDO — y cualquier SKU Bogle futuro).
  insert into incentive_product_rules (program_id, match_name_pattern, priority, category, points_per_bottle, notes)
  select v_program, 'BOGLE', 20, 'Marca', 0, 'Marca del programa (encartes, sin puntos)'
  where not exists (
    select 1 from incentive_product_rules r
    where r.program_id = v_program and r.match_name_pattern = 'BOGLE'
  );

  -- Exclusiones: #58 Muestras y #94 Mostrador Vallarta no existen en
  -- accounts (van por número de cliente); #321 Mostrador Tijuana sí existe.
  select id into v_321 from accounts where client_number = '321';
  insert into incentive_exclusions (program_id, account_id, client_number, reason)
  select v_program, e.acc, e.num, e.motivo
  from (values
    (null::uuid, '58',  'Muestras / degustaciones internas'),
    (null::uuid, '94',  'Ventas de Mostrador Vallarta'),
    (v_321,      '321', 'Ventas Tijuana Mostrador')
  ) as e(acc, num, motivo)
  where not exists (
    select 1 from incentive_exclusions x
    where x.program_id = v_program and x.client_number = e.num
  );
end $$;

-- Detección inicial (backfill): clientes existentes con Bogle cobrado
-- dentro del periodo ya cuentan desde el día 1.
select public.detect_incentive_placements();
