-- ---------------------------------------------------------------------
-- Tokens de acceso público al estado de cuenta
-- Permiten que un cliente (que NO es usuario del CRM) vea su estado de
-- cuenta vía un link sin login. Se generan desde el webhook de correo
-- entrante (/api/inbound/ventas) cuando el remitente del pedido coincide,
-- de forma única, con un contacto registrado de una cuenta.
--
-- El token es un secreto aleatorio largo, de un solo uso conceptual pero
-- válido hasta expirar (TTL configurable). Solo el service-role lo escribe
-- y lo resuelve (RLS sin policies = denegado a clientes normales).
-- ---------------------------------------------------------------------

create table if not exists public.statement_tokens (
  id uuid primary key default gen_random_uuid(),
  token text unique not null,                 -- secreto aleatorio (URL-safe)
  account_id uuid references public.accounts(id) on delete cascade not null,
  source text not null default 'inbound',     -- de dónde se originó (inbound, manual, ...)
  created_for_email text,                      -- remitente al que se le envió el link (auditoría)
  expires_at timestamptz not null,
  revoked_at timestamptz,                       -- revocación manual antes de expirar
  last_accessed_at timestamptz,                 -- última vez que se abrió el link
  access_count int not null default 0,
  created_at timestamptz default now()
);

create index if not exists statement_tokens_account_idx
  on public.statement_tokens (account_id, created_at desc);

-- Solo el service-role accede (webhook crea, ruta pública resuelve). RLS
-- habilitada SIN policies: queda denegado para anon y authenticated.
alter table public.statement_tokens enable row level security;
