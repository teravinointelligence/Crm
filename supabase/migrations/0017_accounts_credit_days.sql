-- =====================================================================
-- Días de crédito por cliente
-- =====================================================================
-- Plazo de crédito (en días) acordado con cada cliente. 0 = contado.
-- null = sin definir. Sirve como default para calcular vencimientos de
-- facturas y para reportes de cartera.
-- =====================================================================

alter table public.accounts
  add column if not exists credit_days int;

alter table public.accounts
  drop constraint if exists accounts_credit_days_check;
alter table public.accounts
  add constraint accounts_credit_days_check
  check (credit_days is null or (credit_days >= 0 and credit_days <= 365));
