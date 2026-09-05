-- =====================================================================
-- 20260905120100 — LLAVE DE PAGADOR 'clabe' (cuenta ordenante SPEI)
-- =====================================================================
-- bank_payer_aliases.kind admitía en la práctica 'firma', 'bnet' y 'rfc'
-- (sin CHECK: la columna es text y la validación vivía solo en el código TS).
-- Falta un tipo para la cuenta ordenante de un SPEI interbancario: BBVA la
-- imprime en "SPEI RECIBIDO <BANCO>" como una línea de 18 dígitos (CLABE) o
-- 20 (la CLABE con "00" al frente). Es distinta del BNET, que solo aparece en
-- "PAGO CUENTA DE TERCERO" (BBVA → BBVA).
--
--   kind 'clabe' → CLABE ordenante, canónica a 18 dígitos
--                  (3 banco + 3 plaza + 11 cuenta + 1 verificador).
--
-- La app (lib/bank/aliases.ts) extrae la CLABE del concepto, valida el dígito
-- verificador y la normaliza a 18 dígitos antes de cruzarla. Aquí:
--   1. CHECK de los valores válidos de kind.
--   2. learn_payer_key normaliza la CLABE (quita no-dígitos y el "00" de la
--      versión a 20) para que una captura manual desde el estado de cuenta
--      quede igual que la que extrae el parser.
--   3. Migra el alias del cliente 389 (Doña Ines), registrado como 'bnet' por
--      falta de opción, a 'clabe' con la llave canónica.
-- =====================================================================

-- 1. Valores válidos de kind. Se valida antes que no haya basura.
do $$
declare bad int;
begin
  select count(*) into bad from public.bank_payer_aliases
   where kind not in ('firma', 'bnet', 'rfc', 'clabe');
  if bad > 0 then
    raise exception 'bank_payer_aliases tiene % filas con kind desconocido; revisar antes de migrar', bad;
  end if;
end $$;

alter table public.bank_payer_aliases
  drop constraint if exists bank_payer_aliases_kind_check;
alter table public.bank_payer_aliases
  add constraint bank_payer_aliases_kind_check
  check (kind in ('firma', 'bnet', 'rfc', 'clabe'));

comment on column public.bank_payer_aliases.kind is
  'firma = tokens del concepto · bnet = clave BNET (PAGO CUENTA DE TERCERO, BBVA→BBVA) · rfc = RFC en el concepto · clabe = cuenta ordenante de SPEI interbancario (18 dígitos canónicos)';

-- 2. Normalización de CLABE (misma regla que normalizeClabe en la app, sin el
--    dígito verificador: el server acepta lo que el operador capture).
create or replace function public.normalize_clabe(p_raw text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when d ~ '^00\d{18}$' then substr(d, 3)
    else d
  end
  from (select regexp_replace(coalesce(p_raw, ''), '\D', '', 'g') as d) x;
$$;

create or replace function public.learn_payer_key(
  p_kind text, p_key text, p_account_id uuid,
  p_source text default 'aprendido', p_notes text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text;
begin
  if p_key is null or length(btrim(p_key)) = 0 then return; end if;
  if not public.can_reconcile() then
    raise exception 'Solo admin o contador pueden registrar llaves de pagador';
  end if;

  v_key := case when p_kind = 'clabe' then public.normalize_clabe(p_key) else btrim(p_key) end;
  if p_kind = 'clabe' and v_key !~ '^\d{18}$' then
    raise exception 'CLABE inválida (%): se esperan 18 dígitos (o 20 con "00" al frente)', p_key;
  end if;

  insert into public.bank_payer_aliases (kind, match_key, account_id, source, notes, hits, created_by)
    values (p_kind, v_key, p_account_id, coalesce(p_source, 'aprendido'), p_notes, 1, public.current_rep_id())
  on conflict (kind, match_key) do update set
    hits   = public.bank_payer_aliases.hits + 1,
    notes  = coalesce(excluded.notes, public.bank_payer_aliases.notes),
    account_id = case
                   when excluded.source = 'catalogo' then excluded.account_id
                   when public.bank_payer_aliases.account_id is distinct from excluded.account_id then null
                   else public.bank_payer_aliases.account_id
                 end,
    ambiguous = case
                   when excluded.source = 'catalogo' then false
                   else public.bank_payer_aliases.ambiguous
                        or (public.bank_payer_aliases.account_id is distinct from excluded.account_id)
                 end,
    source = case when excluded.source = 'catalogo' then 'catalogo' else public.bank_payer_aliases.source end,
    updated_at = now();
end;
$$;

-- 3. Cliente 389 (Doña Ines): cuenta Banorte 00072041011490019166 registrada
--    como 'bnet' por falta de opción → 'clabe' canónica 072041011490019166.
--    Se busca por llave (no por id) y solo si aún no existe la versión 'clabe'.
update public.bank_payer_aliases a
   set kind = 'clabe',
       match_key = public.normalize_clabe(a.match_key),
       updated_at = now()
 where a.kind = 'bnet'
   and public.normalize_clabe(a.match_key) = '072041011490019166'
   and not exists (
     select 1 from public.bank_payer_aliases b
      where b.kind = 'clabe' and b.match_key = '072041011490019166'
   );

-- =====================================================================
-- NOTA DE ARQUITECTURA (solo documentación; no cambia nada)
-- =====================================================================
-- invoices.balance es una COLUMNA GENERADA: (total - coalesce(total_paid, 0)).
-- Cualquier script, RPC o endpoint que aplique pagos debe escribir SOLO
-- total_paid (y status); un UPDATE que toque balance falla con
-- "column "balance" can only be updated to DEFAULT". Los RPC actuales
-- (apply_payment, reconcile_transaction, refresh_invoice_status) ya cumplen.
-- =====================================================================
comment on column public.invoices.balance is
  'GENERADA: total - coalesce(total_paid, 0). No se escribe: los pagos actualizan total_paid y status.';
