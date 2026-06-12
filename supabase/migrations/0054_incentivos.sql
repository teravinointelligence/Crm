-- =====================================================================
-- Programa de Incentivos (genérico) + seed Gerard Bertrand 2026
-- =====================================================================
-- Módulo de gamificación de ventas: cada vendedor acumula puntos por
-- botella vendida de productos del proveedor del programa, con niveles
-- ACUMULABLES y recompensas financiadas por el proveedor.
--
-- Fuente de datos: monthly_sales / monthly_sales_items (el Excel mensual
-- de CONTPAQ). Es la ÚNICA fuente con detalle por producto; las facturas
-- de cartera (invoices) son solo encabezados, así que el filtro de
-- cobranza se aproxima a nivel CUENTA+MES: las botellas de una cuenta en
-- un mes suman puntos solo cuando TODAS las facturas emitidas a esa
-- cuenta ese mes están pagadas (decisión de negocio, ver PR).
--
-- Los puntos NUNCA se almacenan: se calculan en vivo con
-- get_incentive_detail(), así jamás se desincronizan de las ventas.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Normalizador de nombres CONTPAQ: mayúsculas, sin acentos, espacios
-- colapsados. Los nombres vienen con inconsistencias ("GERARD BÉRTRAND",
-- dobles espacios), por eso el matching por nombre SIEMPRE pasa por aquí.
-- ---------------------------------------------------------------------
create or replace function public.incentive_norm(p text)
returns text
language sql immutable strict
as $$
  select regexp_replace(
    upper(translate(p, 'ÁÉÍÓÚÄËÏÖÜÂÊÎÔÛÀÈÌÒÙÑáéíóúäëïöüâêîôûàèìòùñ',
                       'AEIOUAEIOUAEIOUAEIOUNaeiouaeiouaeiouaeioun')),
    '\s+', ' ', 'g'
  );
$$;

-- ---------------------------------------------------------------------
-- INCENTIVE_PROGRAMS — un renglón por programa (GB 2026, futuros…)
-- ---------------------------------------------------------------------
create table if not exists public.incentive_programs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  provider text not null,
  start_date date not null,
  end_date date not null,
  active boolean not null default true,
  -- Si exige cobranza para sumar puntos (regla cuenta+mes 100% pagado).
  -- El corte oficial GB del 21-may-2026 se calculó SIN cobranza, por eso
  -- el cálculo acepta forzar el modo (ver get_incentive_detail).
  require_paid boolean not null default true,
  -- Regex (sobre nombre normalizado) que detecta productos del proveedor
  -- para el reporte de "vendidos sin mapear". Configurable, no hardcodeada.
  unmapped_name_pattern text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- INCENTIVE_LEVELS — niveles acumulables del programa
-- ---------------------------------------------------------------------
create table if not exists public.incentive_levels (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.incentive_programs(id) on delete cascade,
  name text not null,
  points_required int not null,
  reward text not null,
  reward_value_mxn numeric(12,2) not null default 0,
  sort_order int not null default 0,
  unique (program_id, name)
);

-- ---------------------------------------------------------------------
-- INCENTIVE_PRODUCT_RULES — mapeo producto → categoría/puntos.
-- Matching en dos vías (el código gana sobre el patrón):
--   1. codigo_contpaqi: llave estable del producto en CONTPAQ
--      (monthly_sales_items.codigo). Es la vía preferida.
--   2. match_name_pattern: regex sobre el nombre normalizado, para que
--      códigos nuevos del mismo vino (otra añada/presentación) se mapeen
--      solos. Entre patrones decide `priority` (mayor gana): p. ej.
--      "CREMANT DE LIMOUX" (Premium, 20) le gana a "AN [0-9]" (Volumen, 10).
-- La categoría "Excluido" (0 pts) blinda falsos positivos de patrón
-- (p. ej. "WARIS … HERITAGE BRUT" es champagne Waris, no GB Héritage).
-- ---------------------------------------------------------------------
create table if not exists public.incentive_product_rules (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.incentive_programs(id) on delete cascade,
  codigo_contpaqi text,
  match_name_pattern text,
  priority int not null default 0,
  product_id uuid references public.products(id) on delete set null,
  category text not null check (category in ('Íconos','Parcelarias','Châteaux','Premium','Volumen','Excluido')),
  points_per_bottle numeric(8,2) not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  check (codigo_contpaqi is not null or match_name_pattern is not null)
);
create unique index if not exists uq_incentive_rules_codigo
  on public.incentive_product_rules (program_id, codigo_contpaqi)
  where codigo_contpaqi is not null;

-- ---------------------------------------------------------------------
-- INCENTIVE_PARTICIPANTS — vendedores que participan en el programa
-- ---------------------------------------------------------------------
create table if not exists public.incentive_participants (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.incentive_programs(id) on delete cascade,
  rep_id uuid not null references public.sales_reps(id) on delete cascade,
  unique (program_id, rep_id)
);

-- ---------------------------------------------------------------------
-- INCENTIVE_EXCLUSIONS — clientes cuyas compras NO acumulan puntos
-- (degustaciones internas, socios, etc.). Por cuenta del CRM o, si la
-- cuenta no existe en accounts, por número de cliente CONTPAQ.
-- Nota: el cliente #58 "Muestras" del programa GB no existe hoy ni en
-- accounts ni en monthly_sales; cuando aparezca se agrega desde la UI.
-- ---------------------------------------------------------------------
create table if not exists public.incentive_exclusions (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.incentive_programs(id) on delete cascade,
  account_id uuid references public.accounts(id) on delete cascade,
  client_number text,
  reason text,
  created_at timestamptz not null default now(),
  check (account_id is not null or client_number is not null)
);

-- ---------------------------------------------------------------------
-- INCENTIVE_POINTS_SEEN — último marcador que el vendedor ya vio, para
-- la notificación ligera "+X pts" / nivel alcanzado en su próxima sesión.
-- ---------------------------------------------------------------------
create table if not exists public.incentive_points_seen (
  program_id uuid not null references public.incentive_programs(id) on delete cascade,
  rep_id uuid not null references public.sales_reps(id) on delete cascade,
  points_seen numeric(12,2) not null default 0,
  updated_at timestamptz not null default now(),
  primary key (program_id, rep_id)
);

-- Índice de apoyo para el cálculo de cobranza por cuenta+mes.
create index if not exists idx_invoices_account_month
  on public.invoices (account_id, invoice_date);

-- ---------------------------------------------------------------------
-- GET_INCENTIVE_DETAIL — el corazón del módulo. Devuelve un renglón por
-- partida de venta GB (vendedor, mes, cliente, producto, categoría,
-- botellas, puntos, cobrado). SECURITY DEFINER con autorización interna:
-- admin/contador ven todo, el vendedor solo lo suyo.
--
-- p_require_paid:
--   null  → usa la configuración del programa (require_paid)
--   false → modo "facturado" (así se valida el corte oficial GB 21-may)
--   true  → modo "cobrado" (cuenta+mes 100% pagado)
-- Las cantidades negativas (notas de crédito, si algún día se importan)
-- restan puntos de forma natural porque todo es SUM(cantidad).
-- ---------------------------------------------------------------------
create or replace function public.get_incentive_detail(
  p_program_id uuid,
  p_require_paid boolean default null
)
returns table (
  rep_id uuid,
  rep_name text,
  period date,
  account_id uuid,
  client_number text,
  client_name text,
  codigo text,
  producto_nombre text,
  category text,
  points_per_bottle numeric,
  bottles numeric,
  points numeric,
  cobrado boolean
)
language sql
security definer
set search_path = public
as $$
  with prog as (
    select * from incentive_programs where id = p_program_id
  ),
  -- ¿Quién pregunta? El vendedor solo ve lo suyo; admin/contador todo.
  -- El service role (scripts de verificación, crons) también ve todo.
  viewer as (
    select public.is_admin()
      or coalesce(auth.role() = 'service_role', false)
      or exists (
        select 1 from sales_reps sr
        where sr.auth_user_id = auth.uid() and sr.role = 'contador'
      ) as sees_all,
    public.current_rep_id() as me
  ),
  ventas as (
    select ms.sales_rep_id, ms.period, ms.account_id, ms.client_number,
           ms.client_name, i.codigo, i.producto_nombre, i.cantidad
    from monthly_sales ms
    join monthly_sales_items i on i.monthly_sale_id = ms.id
    join prog on ms.period >= prog.start_date and ms.period <= prog.end_date
    join incentive_participants pa
      on pa.program_id = p_program_id and pa.rep_id = ms.sales_rep_id
    where not exists (
      select 1 from incentive_exclusions ex
      where ex.program_id = p_program_id
        and (ex.account_id = ms.account_id
             or (ex.client_number is not null and ex.client_number = ms.client_number))
    )
  ),
  -- Regla aplicable por renglón: código exacto gana; si no, el patrón de
  -- nombre con mayor prioridad (y a igual prioridad, el de más puntos).
  con_regla as (
    select v.*, r.category, r.points_per_bottle
    from ventas v
    cross join lateral (
      select r.category, r.points_per_bottle
      from incentive_product_rules r
      where r.program_id = p_program_id
        and (
          r.codigo_contpaqi = upper(trim(v.codigo))
          or (r.match_name_pattern is not null
              and public.incentive_norm(v.producto_nombre) ~ r.match_name_pattern)
        )
      order by (r.codigo_contpaqi is not null) desc, r.priority desc, r.points_per_bottle desc
      limit 1
    ) r
    where r.category <> 'Excluido'
  ),
  -- Cobranza aproximada por cuenta+mes: hay al menos una factura del mes
  -- y ninguna sigue pendiente/vencida.
  cobranza as (
    select c.account_id, c.period,
           count(inv.id) filter (where inv.id is not null) > 0
             and count(inv.id) filter (where inv.status <> 'pagada') = 0 as pagado
    from (select distinct account_id, period from con_regla) c
    left join invoices inv
      on inv.account_id = c.account_id
     and inv.invoice_date >= c.period
     and inv.invoice_date < (c.period + interval '1 month')::date
    group by c.account_id, c.period
  )
  select cr.sales_rep_id, sr.full_name, cr.period, cr.account_id,
         cr.client_number, cr.client_name, cr.codigo, cr.producto_nombre,
         cr.category, cr.points_per_bottle,
         cr.cantidad as bottles,
         cr.cantidad * cr.points_per_bottle as points,
         cob.pagado as cobrado
  from con_regla cr
  join sales_reps sr on sr.id = cr.sales_rep_id
  join cobranza cob on cob.account_id = cr.account_id and cob.period = cr.period
  cross join viewer vw
  where (vw.sees_all or cr.sales_rep_id = vw.me)
    and (
      not coalesce(p_require_paid, (select require_paid from prog))
      or cob.pagado
    );
$$;

revoke all on function public.get_incentive_detail(uuid, boolean) from anon, public;
grant execute on function public.get_incentive_detail(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------
-- GET_INCENTIVE_UNMAPPED — productos que PARECEN del proveedor (según
-- unmapped_name_pattern del programa) vendidos en el periodo y SIN regla
-- que los cubra. Para la pantalla admin de mapeo. Solo admin.
-- ---------------------------------------------------------------------
create or replace function public.get_incentive_unmapped(p_program_id uuid)
returns table (
  codigo text,
  producto_nombre text,
  bottles numeric,
  meses int,
  primera_venta date,
  ultima_venta date
)
language sql
security definer
set search_path = public
as $$
  select i.codigo, max(i.producto_nombre), sum(i.cantidad)::numeric,
         count(distinct ms.period)::int, min(ms.period), max(ms.period)
  from monthly_sales ms
  join monthly_sales_items i on i.monthly_sale_id = ms.id
  join incentive_programs p on p.id = p_program_id
  where public.is_admin()
    and ms.period >= p.start_date and ms.period <= p.end_date
    and p.unmapped_name_pattern is not null
    and public.incentive_norm(i.producto_nombre) ~ p.unmapped_name_pattern
    and not exists (
      select 1 from incentive_product_rules r
      where r.program_id = p_program_id
        and (r.codigo_contpaqi = upper(trim(i.codigo))
             or (r.match_name_pattern is not null
                 and public.incentive_norm(i.producto_nombre) ~ r.match_name_pattern))
    )
  group by i.codigo
  order by 3 desc;
$$;

revoke all on function public.get_incentive_unmapped(uuid) from anon, public;
grant execute on function public.get_incentive_unmapped(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.incentive_programs enable row level security;
alter table public.incentive_levels enable row level security;
alter table public.incentive_product_rules enable row level security;
alter table public.incentive_participants enable row level security;
alter table public.incentive_exclusions enable row level security;
alter table public.incentive_points_seen enable row level security;

-- Configuración del programa (programa, niveles, reglas, participantes):
-- lectura para cualquier autenticado (el vendedor necesita ver niveles y
-- puntos por botella para el simulador); escritura solo admin.
drop policy if exists incentive_programs_select on public.incentive_programs;
create policy incentive_programs_select on public.incentive_programs
  for select using (auth.uid() is not null);
drop policy if exists incentive_programs_admin on public.incentive_programs;
create policy incentive_programs_admin on public.incentive_programs
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists incentive_levels_select on public.incentive_levels;
create policy incentive_levels_select on public.incentive_levels
  for select using (auth.uid() is not null);
drop policy if exists incentive_levels_admin on public.incentive_levels;
create policy incentive_levels_admin on public.incentive_levels
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists incentive_rules_select on public.incentive_product_rules;
create policy incentive_rules_select on public.incentive_product_rules
  for select using (auth.uid() is not null);
drop policy if exists incentive_rules_admin on public.incentive_product_rules;
create policy incentive_rules_admin on public.incentive_product_rules
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists incentive_participants_select on public.incentive_participants;
create policy incentive_participants_select on public.incentive_participants
  for select using (auth.uid() is not null);
drop policy if exists incentive_participants_admin on public.incentive_participants;
create policy incentive_participants_admin on public.incentive_participants
  for all using (public.is_admin()) with check (public.is_admin());

-- Exclusiones: solo admin (es configuración interna).
drop policy if exists incentive_exclusions_admin on public.incentive_exclusions;
create policy incentive_exclusions_admin on public.incentive_exclusions
  for all using (public.is_admin()) with check (public.is_admin());

-- Marcador de "ya lo vi": cada vendedor el suyo; admin todo.
drop policy if exists incentive_seen_own on public.incentive_points_seen;
create policy incentive_seen_own on public.incentive_points_seen
  for all using (rep_id = public.current_rep_id() or public.is_admin())
  with check (rep_id = public.current_rep_id() or public.is_admin());

-- =====================================================================
-- SEED — Gerard Bertrand 2026
-- =====================================================================
do $$
declare
  v_program uuid;
begin
  select id into v_program from incentive_programs where name = 'Gerard Bertrand 2026';
  if v_program is null then
    insert into incentive_programs
      (name, provider, start_date, end_date, active, require_paid, unmapped_name_pattern, notes)
    values (
      'Gerard Bertrand 2026', 'Gerard Bertrand',
      '2026-01-01', '2026-12-31', true, true,
      -- Detector de productos GB para el reporte de no-mapeados (sobre
      -- nombre normalizado). "BERTRAND" cubre la mayoría de las líneas.
      '(BERTRAND|CIGALUS|CLOS DU TEMPLE|CLOS D.?ORA|VILLA SOLEILLA|HOSPITALET|VILLEMAJOU|FRENCH CANCAN|PAPILOU|CREMANT DE LIMOUX|ORANGE GOLD|L.?AIGLE|KOSMOS|GRIS BLANC|GRANDE BLEUE|COTE DES ROSES|HERITAGE|PRIMA NATURE|6 ?EME SENS|LEGEND VINTAGE|NATURAE|ASPRES)',
      'Programa de incentivos GB 2026. Niveles acumulables financiados 100% por Gerard Bertrand. Corte oficial de referencia: 21-may-2026 (calculado sobre facturado, sin filtro de cobranza).'
    )
    returning id into v_program;
  end if;

  -- Niveles (acumulables)
  insert into incentive_levels (program_id, name, points_required, reward, reward_value_mxn, sort_order)
  values
    (v_program, 'Bronce',   300, 'Coravin (equipo de conservación)',          7500, 1),
    (v_program, 'Plata',    700, 'Cena para 2 · 50 Best o Michelin',         17500, 2),
    (v_program, 'Oro',     1500, 'Staycation 2 noches · México',             37500, 3),
    (v_program, 'Platino', 3000, 'Viaje a bodegas Gerard Bertrand · Francia',75000, 4)
  on conflict (program_id, name) do nothing;

  -- Participantes: los 5 vendedores (NO Sabrina/admin)
  insert into incentive_participants (program_id, rep_id)
  select v_program, sr.id from sales_reps sr
  where sr.email in ('yamile@teravino.com','andra@teravino.com','citlali@teravino.com',
                     'emmanuel@teravino.com','felix@teravino.com')
  on conflict (program_id, rep_id) do nothing;

  -- Reglas de mapeo por PATRÓN de nombre normalizado. El admin puede
  -- después fijar reglas por código CONTPAQ desde la UI (tienen prioridad
  -- absoluta sobre los patrones). Prioridades: Excluido 30 > específico
  -- 20 > genérico 10.
  insert into incentive_product_rules (program_id, match_name_pattern, priority, category, points_per_bottle, notes)
  select v_program, p.pat, p.pri, p.cat, p.pts, p.note
  from (values
    -- Blindaje contra falsos positivos de patrón (no son Gerard Bertrand)
    ('(WARIS|DOPFF|ALSACE)', 30, 'Excluido', 0::numeric, 'Champagne Waris / Dopff & Fils: no son GB aunque digan Heritage/Crémant'),
    -- Íconos · 50 pts
    ('CLOS DU TEMPLE',  20, 'Íconos', 50, null),
    ('CLOS D.?ORA',     20, 'Íconos', 50, null),
    ('VILLA SOLEILLA',  20, 'Íconos', 50, null),
    ('LEGEND VINTAGE',  20, 'Íconos', 50, null),
    -- Châteaux · 10 pts
    ('HOSPITALET',      20, 'Châteaux', 10, 'Château l''Hospitalet'),
    ('VILLEMAJOU',      20, 'Châteaux', 10, 'Château de Villemajou'),
    ('CIGALUS',         20, 'Châteaux', 10, 'Cigalus blanco y tinto'),
    -- Premium · 5 pts
    ('FRENCH CANCAN',           20, 'Premium', 5, null),
    ('PAPILOU',                 20, 'Premium', 5, 'Papilou Pet Nat'),
    ('(CREMANT DE LIMOUX|AN ?825)', 20, 'Premium', 5, 'Héritage Crémants (An 825 Crémant de Limoux)'),
    ('VDN',                     20, 'Premium', 5, 'Héritage VDN'),
    ('ORANGE GOLD',             20, 'Premium', 5, null),
    ('AIGLE',                   20, 'Premium', 5, 'Domaine de l''Aigle: Noir Chardonnay, Viognier, Royal, Pinot Noir'),
    ('KOSMOS',                  20, 'Premium', 5, null),
    -- Volumen · 1 pt
    ('GRIS BLANC',      10, 'Volumen', 1, null),
    ('GRANDE BLEUE',    10, 'Volumen', 1, 'La Grande Bleue'),
    ('COTE DES ROSES',  10, 'Volumen', 1, 'Côte des Roses (programa lista la 375ml/12-355)'),
    ('HERITAGE',        10, 'Volumen', 1, 'Héritage excepto Crémants (los Crémant/VDN ganan por prioridad 20)'),
    ('AN ?[0-9]{3,4}',  10, 'Volumen', 1, 'Línea Héritage "An XXX" como viene de CONTPAQ (ej. AN940); An 825 Crémant gana por prioridad'),
    ('PRIMA NATURE',    10, 'Volumen', 1, 'Prima Nature Chardonnay y Cabernet Sauvignon'),
    ('6 ?EME SENS',     10, 'Volumen', 1, '6ème Sens Rosé, Blanco y Rouge')
  ) as p(pat, pri, cat, pts, note)
  where not exists (
    select 1 from incentive_product_rules r
    where r.program_id = v_program and r.match_name_pattern = p.pat
  );

  -- Exclusiones: el cliente "Muestras" (#58 en el programa GB) aún no
  -- existe en accounts ni en monthly_sales; se agregará desde la UI admin
  -- cuando aparezca en una importación.
end $$;
