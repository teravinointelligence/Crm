-- Datos fiscales adicionales del catálogo de clientes CONTPAQi.
-- El export "Todos los Clientes" trae Uso CFDI y Régimen fiscal por cliente;
-- los guardamos junto a rfc/fiscal_name para tenerlos a la mano en facturación.
alter table public.accounts
  add column if not exists uso_cfdi text,
  add column if not exists regimen_fiscal text;

comment on column public.accounts.uso_cfdi is 'Uso CFDI del cliente (ej. G01, G03, S01). Fuente: catálogo CONTPAQi.';
comment on column public.accounts.regimen_fiscal is 'Régimen fiscal del cliente (ej. 601, 616). Fuente: catálogo CONTPAQi.';
