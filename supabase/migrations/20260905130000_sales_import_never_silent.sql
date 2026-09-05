-- =====================================================================
-- 20260905130000 — IMPORTADOR DE VENTAS: NUNCA DESCARTAR EN SILENCIO
-- =====================================================================
-- Problema (ago/sep 2026): el importador del "Reporte de Ventas por Cliente"
-- de CONTPAQ descartaba a todo cliente cuyo # no existía en accounts o cuya
-- cuenta no tenía vendedor, y sales_imports no dejaba rastro de cuánto se
-- perdió. Agosto quedó con un hueco de $13,012.99 (c501, c505, c343,
-- MUESTRAS c496–c500 y un # de cliente duplicado, 430) sin que nadie se
-- enterara.
--
-- Cambios:
--   1. accounts.needs_review: bandera para altas automáticas / cuentas sin
--      vendedor que Dirección debe revisar. account_type admite 'muestras'
--      (cuentas MUESTRAS de cada vendedor: fuera de comisiones, metas e
--      incentivos en la app).
--   2. monthly_sales.notes: anotaciones por fila (anomalías del mes).
--   3. sales_imports: cuántos clientes se crearon / se saltaron / se
--      retiraron / sin vendedor, totales del reporte vs importados y la
--      diferencia. rows_error refleja descartes reales.
--   4. RPC import_monthly_sales_contpaq: hace TODO el import en una sola
--      transacción (altas de cuentas, cabeceras, partidas, retiro de filas
--      del periodo que ya no vienen, bitácora y cuadre). Lo usan la UI, la
--      sincronización desde Drive y el script de terminal.
-- =====================================================================

-- 1. accounts -----------------------------------------------------------
alter table public.accounts
  add column if not exists needs_review boolean not null default false;
comment on column public.accounts.needs_review is
  'true = alta automática desde import de ventas o cuenta sin vendedor: Dirección debe asignar vendedor y completar datos.';
create index if not exists accounts_needs_review_idx
  on public.accounts (needs_review) where needs_review;

alter table public.accounts drop constraint if exists accounts_account_type_check;
alter table public.accounts add constraint accounts_account_type_check
  check (account_type is null or account_type in
    ('hotel', 'restaurante', 'bar', 'cafe', 'club', 'tienda', 'distribuidor', 'muestras', 'otro'));
comment on column public.accounts.account_type is
  'Tipo de cuenta. ''muestras'' = cuenta CONTPAQ de muestras (c58 y c496–c500 por vendedor): se excluye de comisiones, metas e incentivos.';

-- 2. monthly_sales -------------------------------------------------------
alter table public.monthly_sales add column if not exists notes text;
comment on column public.monthly_sales.notes is
  'Anotaciones del mes para esta cuenta (p. ej. ventas a $0.01 por reposición/cortesía).';

-- 3. sales_imports -------------------------------------------------------
alter table public.sales_imports
  add column if not exists customers_created int not null default 0 check (customers_created >= 0),
  add column if not exists customers_skipped int not null default 0 check (customers_skipped >= 0),
  add column if not exists customers_removed int not null default 0 check (customers_removed >= 0),
  add column if not exists customers_without_rep int not null default 0 check (customers_without_rep >= 0),
  add column if not exists report_totals jsonb,
  add column if not exists imported_totals jsonb,
  add column if not exists total_diff numeric(14,2);
comment on column public.sales_imports.customers_created is 'Cuentas creadas automáticamente (needs_review = true).';
comment on column public.sales_imports.customers_skipped is 'Clientes del reporte que NO se importaron (sin # de cliente). Cuentan en rows_error.';
comment on column public.sales_imports.customers_removed is 'Filas del periodo que se retiraron porque ya no vienen en el reporte (reimport idempotente).';
comment on column public.sales_imports.customers_without_rep is 'Clientes importados con sales_rep_id nulo (cuenta sin vendedor).';
comment on column public.sales_imports.report_totals is 'Fila "Total General" del reporte: {cantidad, neto, descuento, neto_desc, impuesto, total}.';
comment on column public.sales_imports.imported_totals is 'Suma de lo importado con la misma estructura.';
comment on column public.sales_imports.total_diff is 'report_totals.total - imported_totals.total. |diff| > 1.00 = alerta en la UI.';

-- 4. RPC ---------------------------------------------------------------
create or replace function public.import_monthly_sales_contpaq(
  p_period date,
  p_clientes jsonb,
  p_source_file_name text default null,
  p_source_format text default 'contpaq',
  p_report_totals jsonb default null,
  p_parse_errors int default 0,
  p_replace_period boolean default true
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_c jsonb;
  v_cn text;
  v_name text;
  v_n int;
  v_account_id uuid;
  v_rep uuid;
  v_sale_id uuid;
  v_is_muestras boolean;
  v_note text;
  v_touched uuid[] := '{}';
  v_items jsonb := '[]';
  v_created jsonb := '[]';
  v_without_rep jsonb := '[]';
  v_dups jsonb := '[]';
  v_skipped jsonb := '[]';
  v_removed jsonb := '[]';
  v_customers int := 0;
  v_lines int := 0;
  v_imported jsonb;
  v_diff numeric;
  v_import_id uuid;
begin
  if p_period is null or p_period <> date_trunc('month', p_period)::date then
    raise exception 'p_period debe ser el primer día del mes (YYYY-MM-01)';
  end if;
  if not (
    public.is_admin()
    or current_setting('request.jwt.claim.role', true) = 'service_role'
    or current_user in ('postgres', 'supabase_admin')
  ) then
    raise exception 'Solo admin puede importar ventas';
  end if;
  if p_clientes is null or jsonb_typeof(p_clientes) <> 'array' or jsonb_array_length(p_clientes) = 0 then
    raise exception 'p_clientes vacío: no hay clientes que importar';
  end if;

  v_note := format('Alta automática desde import de ventas %s — REVISAR vendedor y datos',
                   to_char(current_date, 'YYYY-MM-DD'));

  for v_c in select * from jsonb_array_elements(p_clientes) loop
    v_cn := nullif(regexp_replace(coalesce(v_c->>'client_number', ''), '^0+', ''), '');
    v_name := nullif(btrim(coalesce(v_c->>'client_name', '')), '');
    if v_cn is null then
      v_skipped := v_skipped || jsonb_build_object(
        'client_number', v_c->>'client_number', 'client_name', v_name, 'reason', 'sin # de cliente');
      continue;
    end if;
    if v_name is null then v_name := 'Cliente CONTPAQ ' || v_cn; end if;

    select count(*) into v_n from public.accounts a
     where nullif(regexp_replace(coalesce(a.client_number, ''), '^0+', ''), '') = v_cn;

    if v_n = 0 then
      -- Alta automática: nunca se descarta un cliente que CONTPAQ ya facturó.
      v_is_muestras := v_name ~* '^\s*muestras';
      insert into public.accounts
        (client_number, business_name, fiscal_name, status, assigned_rep_id, credit_days,
         notes, needs_review, account_type)
      values
        (v_cn, v_name, v_name, 'activo', null, 60,
         v_note, true, case when v_is_muestras then 'muestras' else null end)
      returning id into v_account_id;
      v_rep := null;
      v_created := v_created || jsonb_build_object(
        'client_number', v_cn, 'client_name', v_name, 'account_id', v_account_id, 'muestras', v_is_muestras);
    else
      if v_n > 1 then
        -- # de cliente repetido en el CRM: continuidad (ya tiene fila del
        -- periodo) > activo > más reciente. Se reporta, no se adivina en silencio.
        select a.id, a.assigned_rep_id into v_account_id, v_rep
          from public.accounts a
         where nullif(regexp_replace(coalesce(a.client_number, ''), '^0+', ''), '') = v_cn
         order by (exists (select 1 from public.monthly_sales ms
                            where ms.account_id = a.id and ms.period = p_period)) desc,
                  (a.status = 'activo') desc,
                  a.created_at desc
         limit 1;
        v_dups := v_dups || jsonb_build_object(
          'client_number', v_cn, 'client_name', v_name, 'account_id', v_account_id, 'n', v_n);
      else
        select a.id, a.assigned_rep_id into v_account_id, v_rep
          from public.accounts a
         where nullif(regexp_replace(coalesce(a.client_number, ''), '^0+', ''), '') = v_cn;
      end if;
      if v_rep is null then
        update public.accounts set needs_review = true where id = v_account_id and not needs_review;
      end if;
    end if;

    if v_rep is null then
      v_without_rep := v_without_rep || jsonb_build_object(
        'client_number', v_cn, 'client_name', v_name, 'account_id', v_account_id);
    end if;

    insert into public.monthly_sales
      (account_id, sales_rep_id, period, client_number, client_name, vendedor_excel,
       venta_bruta, neto, descuento, neto_desc)
    values
      (v_account_id, v_rep, p_period, v_cn, v_name, null,
       coalesce((v_c->>'venta_bruta')::numeric, 0), coalesce((v_c->>'neto')::numeric, 0),
       coalesce((v_c->>'descuento')::numeric, 0), coalesce((v_c->>'neto_desc')::numeric, 0))
    on conflict (account_id, period) do update set
      sales_rep_id = excluded.sales_rep_id,
      client_number = excluded.client_number,
      client_name = excluded.client_name,
      venta_bruta = excluded.venta_bruta,
      neto = excluded.neto,
      descuento = excluded.descuento,
      neto_desc = excluded.neto_desc,
      updated_at = now()
    returning id into v_sale_id;
    v_touched := v_touched || v_sale_id;
    v_customers := v_customers + 1;

    select v_items || coalesce(jsonb_agg(e || jsonb_build_object('monthly_sale_id', v_sale_id)), '[]'::jsonb)
      into v_items
      from jsonb_array_elements(coalesce(v_c->'items', '[]'::jsonb)) e;
  end loop;

  -- Partidas: reemplazo atómico (misma garantía que replace_sales_items).
  delete from public.monthly_sales_items where monthly_sale_id = any(v_touched);
  insert into public.monthly_sales_items
    (monthly_sale_id, codigo, producto_nombre, cantidad, neto, descuento, neto_desc, impuesto, total)
  select (e->>'monthly_sale_id')::uuid, nullif(e->>'codigo', ''), e->>'producto_nombre',
         coalesce((e->>'cantidad')::numeric, 0), coalesce((e->>'neto')::numeric, 0),
         coalesce((e->>'descuento')::numeric, 0), coalesce((e->>'neto_desc')::numeric, 0),
         coalesce((e->>'impuesto')::numeric, 0), coalesce((e->>'total')::numeric, 0)
    from jsonb_array_elements(v_items) e;
  get diagnostics v_lines = row_count;

  -- Idempotencia: el reporte CONTPAQ trae el mes completo, así que las filas
  -- del periodo que ya no vienen (facturas canceladas, # de cliente que cambió
  -- de cuenta) se retiran en vez de quedarse duplicando.
  if p_replace_period then
    with del as (
      delete from public.monthly_sales ms
       where ms.period = p_period and not (ms.id = any(v_touched))
      returning ms.client_number, ms.client_name, ms.venta_bruta, ms.account_id
    )
    select coalesce(jsonb_agg(jsonb_build_object(
             'client_number', client_number, 'client_name', client_name,
             'venta_bruta', venta_bruta, 'account_id', account_id)), '[]'::jsonb)
      into v_removed
      from del;
  end if;

  -- Cuadre contra el "Total General" del reporte.
  select jsonb_build_object(
           'cantidad', coalesce(sum(i.cantidad), 0), 'neto', coalesce(sum(i.neto), 0),
           'descuento', coalesce(sum(i.descuento), 0), 'neto_desc', coalesce(sum(i.neto_desc), 0),
           'impuesto', coalesce(sum(i.impuesto), 0), 'total', coalesce(sum(i.total), 0))
    into v_imported
    from public.monthly_sales_items i
   where i.monthly_sale_id = any(v_touched);
  if p_report_totals is not null and (p_report_totals ? 'total') then
    v_diff := round((p_report_totals->>'total')::numeric - (v_imported->>'total')::numeric, 2);
  end if;

  insert into public.sales_imports
    (period, source_file_name, source_format, customers_imported, product_lines_imported, rows_error,
     customers_created, customers_skipped, customers_removed, customers_without_rep,
     report_totals, imported_totals, total_diff)
  values
    (p_period, p_source_file_name, coalesce(p_source_format, 'contpaq'), v_customers, v_lines,
     coalesce(p_parse_errors, 0) + jsonb_array_length(v_skipped),
     jsonb_array_length(v_created), jsonb_array_length(v_skipped), jsonb_array_length(v_removed),
     jsonb_array_length(v_without_rep), p_report_totals, v_imported, v_diff)
  returning id into v_import_id;

  return jsonb_build_object(
    'import_id', v_import_id,
    'period', p_period,
    'customers', v_customers,
    'product_lines', v_lines,
    'created', v_created,
    'without_rep', v_without_rep,
    'duplicates', v_dups,
    'skipped', v_skipped,
    'removed', v_removed,
    'report_totals', p_report_totals,
    'imported_totals', v_imported,
    'total_diff', v_diff,
    'diff_alert', coalesce(abs(v_diff) > 1.00, false)
  );
end;
$$;

revoke all on function public.import_monthly_sales_contpaq(date, jsonb, text, text, jsonb, int, boolean) from public, anon;
grant execute on function public.import_monthly_sales_contpaq(date, jsonb, text, text, jsonb, int, boolean) to authenticated, service_role;

comment on function public.import_monthly_sales_contpaq(date, jsonb, text, text, jsonb, int, boolean) is
  'Import atómico del Reporte de Ventas por Cliente (CONTPAQ): crea cuentas faltantes (needs_review), upsert de monthly_sales, reemplazo de partidas, retiro de filas del periodo que ya no vienen, bitácora en sales_imports y cuadre vs Total General.';
