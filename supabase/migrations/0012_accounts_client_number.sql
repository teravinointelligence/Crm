-- Número de cliente del sistema contable (CONTPAQi). No es único: una misma "razón social"
-- puede operar varios negocios distintos en la relación de clientes.
alter table public.accounts
  add column if not exists client_number text;
create index if not exists idx_accounts_client_number on public.accounts(client_number);

-- Extensiones para matching aproximado al importar desde la relación de clientes
create extension if not exists pg_trgm;
create extension if not exists unaccent;
create index if not exists idx_accounts_business_name_trgm
  on public.accounts using gin (business_name gin_trgm_ops);
create index if not exists idx_accounts_fiscal_name_trgm
  on public.accounts using gin (fiscal_name gin_trgm_ops);
