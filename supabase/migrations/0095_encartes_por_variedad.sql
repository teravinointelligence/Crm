-- =====================================================================
-- 0095 · Encartes por VARIEDAD (cliente × producto de la marca)
-- =====================================================================
-- Cambio de regla (dirección, 17-jul-2026): un encarte es la colocación
-- de UNA variedad de la marca con UN cliente. Si un cliente compra 2
-- variedades (p.ej. Bogle Chardonnay y Bogle Pinot Noir), cuentan 2
-- encartes. Antes un cliente contaba una sola vez.
--
-- Retrocompatible con lo ya validado: los encartes existentes se
-- conservan tal cual (se les asigna la variedad de su primera venta en
-- el periodo) y la detección inserta las variedades adicionales como
-- encartes NUEVOS — pendientes de validación, igual que cualquier otro.
-- La misma variedad repetida con el mismo cliente sigue contando 1.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Variedad en el encarte
-- ---------------------------------------------------------------------
alter table public.incentive_placements
  add column if not exists codigo text,
  add column if not exists producto text;

-- ---------------------------------------------------------------------
-- 2. Backfill: a cada encarte existente se le asigna la variedad de su
--    PRIMERA venta de la marca dentro del periodo (mes más antiguo; a
--    igual mes, por código alfabético — determinista). Las demás
--    variedades del mismo cliente las insertará la detección (paso 5).
-- ---------------------------------------------------------------------
with fuente as (
  select pl.id, v.codigo, v.producto
  from public.incentive_placements pl
  join public.incentive_programs prog
    on prog.id = pl.program_id and prog.tipo = 'encartes'
  cross join lateral (
    select upper(trim(i.codigo)) as codigo,
           min(i.producto_nombre) as producto
    from public.monthly_sales ms
    join public.monthly_sales_items i on i.monthly_sale_id = ms.id
    where ms.account_id = pl.account_id
      and ms.sales_rep_id = pl.rep_id
      and ms.period >= prog.start_date and ms.period <= prog.end_date
      and exists (
        select 1 from public.incentive_product_rules r
        where r.program_id = prog.id and r.category = 'Marca'
          and (r.codigo_contpaqi = upper(trim(i.codigo))
               or (r.match_name_pattern is not null
                   and public.incentive_norm(i.producto_nombre) ~ r.match_name_pattern))
      )
    group by upper(trim(i.codigo))
    order by min(ms.period), upper(trim(i.codigo))
    limit 1
  ) v
  where pl.codigo is null
)
update public.incentive_placements pl
set codigo = f.codigo, producto = f.producto
from fuente f
where pl.id = f.id;

-- ---------------------------------------------------------------------
-- 3. Un encarte por (programa, vendedor, cliente, variedad).
--    codigo='' queda para encartes huérfanos de venta (no debería haber:
--    solo si la venta que originó el encarte se movió de cuenta).
-- ---------------------------------------------------------------------
update public.incentive_placements set codigo = '' where codigo is null;
alter table public.incentive_placements
  alter column codigo set default '',
  alter column codigo set not null;
alter table public.incentive_placements
  drop constraint if exists incentive_placements_program_id_rep_id_account_id_key;
alter table public.incentive_placements
  add constraint incentive_placements_variedad_key
  unique (program_id, rep_id, account_id, codigo);

-- ---------------------------------------------------------------------
-- 4. Detección por variedad (misma mecánica de 0055, con el grano
--    cliente×variedad y guardando codigo/producto).
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
      -- cliente+variedad+mes del periodo con la marca del programa vendida
      select ms.sales_rep_id, ms.account_id, ms.client_number, ms.client_name,
             ms.period, upper(trim(i.codigo)) as codigo,
             min(i.producto_nombre) as producto, sum(i.cantidad) as botellas
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
      group by 1,2,3,4,5,6
      having sum(i.cantidad) > 0
    ),
    elegibles as (
      -- Según require_paid del programa (igual que 0055):
      --  · false (Bogle): basta la VENTA facturada del mes; el orden lo
      --    da la fecha de la primera factura del cliente en ese mes.
      --  · true: además el cuenta+mes debe estar 100% pagado.
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
      -- una variedad cuenta UNA vez por cliente: su primer mes elegible
      select distinct on (sales_rep_id, account_id, codigo) *
      from elegibles
      order by sales_rep_id, account_id, codigo, period
    )
    insert into incentive_placements
      (program_id, rep_id, account_id, client_number, client_name,
       period, fecha_deteccion, deteccion_ts, estado, codigo, producto)
    select prog.id, p.sales_rep_id, p.account_id, p.client_number, p.client_name,
           p.period, p.fecha_evento, p.ts_evento,
           case when prog.requiere_validacion then 'pendiente' else 'validado' end,
           p.codigo, p.producto
    from primera p
    -- Mientras el encarte siga PENDIENTE, cada corrida recalcula su mes,
    -- fecha y nombre de producto. Al validarse/rechazarse se congela.
    on conflict (program_id, rep_id, account_id, codigo) do update
      set period = excluded.period,
          client_number = excluded.client_number,
          client_name = excluded.client_name,
          producto = excluded.producto,
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

-- ---------------------------------------------------------------------
-- 5. Actualizar la descripción del programa Bogle y correr la detección
--    (inserta las variedades adicionales de clientes ya contados).
-- ---------------------------------------------------------------------
update public.incentive_programs
set notes = replace(notes,
  '10 clientes distintos comprando Bogle',
  '10 encartes — cada variedad Bogle colocada con un cliente cuenta como un encarte —')
where tipo = 'encartes' and notes like '%10 clientes distintos comprando Bogle%';

select public.detect_incentive_placements();
