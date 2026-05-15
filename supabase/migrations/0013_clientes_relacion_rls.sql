-- Asistente de matching de # cliente: marcar entradas del CSV que no son cuentas reales,
-- y RLS admin-only sobre la tabla de staging cargada manualmente vía execute_sql.
alter table public.clientes_relacion_raw
  add column if not exists ignored boolean not null default false;

alter table public.clientes_relacion_raw enable row level security;
drop policy if exists clientes_relacion_admin_all on public.clientes_relacion_raw;
create policy clientes_relacion_admin_all on public.clientes_relacion_raw
  for all using (public.is_admin()) with check (public.is_admin());
