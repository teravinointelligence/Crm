-- =====================================================================
-- 0038 — LLAVES DE IDENTIFICACIÓN DE PAGADOR (BNET / RFC / firma) + catálogo
-- =====================================================================
-- Generaliza bank_payer_aliases (0037) para identificar al pagador por varias
-- llaves, no solo por la "firma" de nombre:
--   kind 'firma' → tokens distintivos del concepto (como en 0037)
--   kind 'bnet'  → clave BNET del concepto (estable por pagador)
--   kind 'rfc'   → RFC que aparece en el concepto
-- Y permite sembrarlas desde el catálogo (source 'catalogo', autoritativo)
-- además de aprenderlas al conciliar (source 'aprendido').
--
-- ADITIVA: agrega `match_key` y conserva `signature` (sin NOT NULL/unique)
-- para no romper el código aún desplegado que la lee. Una migración futura
-- puede retirar `signature`.
-- =====================================================================

alter table public.bank_payer_aliases
  add column if not exists kind text not null default 'firma',
  add column if not exists source text not null default 'aprendido',
  add column if not exists notes text,
  add column if not exists match_key text;

-- Rellena match_key desde la firma existente.
update public.bank_payer_aliases set match_key = signature where match_key is null;

-- signature deja de ser obligatoria/única (compat transitoria).
alter table public.bank_payer_aliases alter column signature drop not null;
alter table public.bank_payer_aliases drop constraint if exists bank_payer_aliases_signature_key;

-- Nueva unicidad por (kind, match_key).
create unique index if not exists bank_payer_aliases_kind_key
  on public.bank_payer_aliases (kind, match_key);

-- Upsert general de una llave. 'catalogo' es autoritativo (fija la cuenta y
-- limpia ambigüedad); 'aprendido' se autodesactiva si la misma llave apunta a
-- clientes distintos.
create or replace function public.learn_payer_key(
  p_kind text, p_key text, p_account_id uuid,
  p_source text default 'aprendido', p_notes text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_key is null or length(btrim(p_key)) = 0 then return; end if;
  if not public.can_reconcile() then
    raise exception 'Solo admin o contador pueden registrar llaves de pagador';
  end if;

  insert into public.bank_payer_aliases (kind, match_key, account_id, source, notes, hits, created_by)
    values (p_kind, btrim(p_key), p_account_id, coalesce(p_source, 'aprendido'), p_notes, 1, public.current_rep_id())
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

-- Compat: la firma sigue funcionando para callers viejos (confirm route 0037).
create or replace function public.learn_payer_alias(p_signature text, p_account_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.learn_payer_key('firma', p_signature, p_account_id, 'aprendido', null);
end;
$$;
