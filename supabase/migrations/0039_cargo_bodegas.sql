-- =====================================================================
-- 0039 — ETIQUETADO DE CARGOS POR BODEGA (renta/mantenimiento) + reglas
-- =====================================================================
-- Permite etiquetar manualmente un cargo del estado de cuenta con su
-- categoría de bodega (renta/mantenimiento) y APRENDE la regla (firma del
-- concepto + monto) para auto-etiquetar el mismo gasto el próximo mes.
-- =====================================================================

alter table public.bank_transactions
  add column if not exists cargo_categoria text;

create table if not exists public.bank_cargo_rules (
  id uuid primary key default gen_random_uuid(),
  match_key text not null unique,   -- firma|monto (lib/bank/bodegas.ts)
  categoria text not null,          -- key de BODEGA_CATEGORIAS
  hits int not null default 1,
  created_by uuid references public.sales_reps(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Aprende/actualiza una regla de etiquetado de cargo.
create or replace function public.learn_cargo_rule(p_match_key text, p_categoria text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_match_key is null or length(btrim(p_match_key)) = 0 or p_categoria is null then
    return;
  end if;
  if not public.can_reconcile() then
    raise exception 'Solo admin o contador pueden etiquetar cargos';
  end if;

  insert into public.bank_cargo_rules (match_key, categoria, created_by)
    values (btrim(p_match_key), p_categoria, public.current_rep_id())
  on conflict (match_key) do update set
    categoria = excluded.categoria,  -- la última etiqueta manda
    hits = public.bank_cargo_rules.hits + 1,
    updated_at = now();
end;
$$;

alter table public.bank_cargo_rules enable row level security;

drop policy if exists cargo_rules_read on public.bank_cargo_rules;
create policy cargo_rules_read on public.bank_cargo_rules
  for select using (public.can_read_all());

drop policy if exists cargo_rules_write on public.bank_cargo_rules;
create policy cargo_rules_write on public.bank_cargo_rules
  for all using (public.can_reconcile()) with check (public.can_reconcile());
