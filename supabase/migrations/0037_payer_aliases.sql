-- =====================================================================
-- 0037 — MEMORIA ORDENANTE → CLIENTE (conciliación bancaria)
-- =====================================================================
-- Aprende, de cada conciliación manual, a qué cliente pertenece la "firma"
-- del pagador (tokens distintivos del concepto del depósito). En el próximo
-- estado de cuenta, los depósitos con la misma firma se autosugieren.
--
-- Seguridad anti-falsos-positivos: si una firma termina apuntando a >1
-- cliente, se marca `ambiguous` y se deja de sugerir (account_id = null).
-- La firma se calcula en la app (lib/bank/aliases.ts) y se guarda como texto.
-- =====================================================================

create table if not exists public.bank_payer_aliases (
  id uuid primary key default gen_random_uuid(),
  signature text not null unique,
  account_id uuid references public.accounts(id) on delete cascade,
  ambiguous boolean not null default false,
  hits int not null default 1,
  created_by uuid references public.sales_reps(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Aprende/actualiza un alias. Idempotente por firma; se autodesactiva si la
-- misma firma se concilia contra clientes distintos.
create or replace function public.learn_payer_alias(p_signature text, p_account_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_signature is null or length(btrim(p_signature)) = 0 then
    return; -- firma no distintiva → no aprendemos
  end if;
  if not public.can_reconcile() then
    raise exception 'Solo admin o contador pueden aprender aliases';
  end if;

  insert into public.bank_payer_aliases (signature, account_id, hits, created_by)
    values (p_signature, p_account_id, 1, public.current_rep_id())
  on conflict (signature) do update set
    hits       = public.bank_payer_aliases.hits + 1,
    ambiguous  = public.bank_payer_aliases.ambiguous
                 or (public.bank_payer_aliases.account_id is distinct from excluded.account_id),
    account_id = case
                   when public.bank_payer_aliases.account_id is distinct from excluded.account_id
                   then null                                   -- conflicto → desactiva
                   else public.bank_payer_aliases.account_id
                 end,
    updated_at = now();
end;
$$;

-- RLS: leen admin/contador (alimenta el matcher); escritura vía el RPC o
-- directamente admin/contador.
alter table public.bank_payer_aliases enable row level security;

drop policy if exists payer_aliases_read on public.bank_payer_aliases;
create policy payer_aliases_read on public.bank_payer_aliases
  for select using (public.can_read_all());

drop policy if exists payer_aliases_write on public.bank_payer_aliases;
create policy payer_aliases_write on public.bank_payer_aliases
  for all using (public.can_reconcile()) with check (public.can_reconcile());
