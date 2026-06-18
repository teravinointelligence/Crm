-- Bitácora de correos enviados a clientes (portafolio, estado de cuenta,
-- promociones, requisitos, muestras, cobranza…). Permite ver "último envío"
-- por cuenta y tipo. Best-effort: se escribe tras un envío exitoso.

create table if not exists client_email_log (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references accounts(id) on delete set null,
  kind text not null,                       -- portafolio | estado_cuenta | promocion | requisitos | muestra | cobranza | pedido | otro
  subject text,
  recipients text[] not null default '{}',
  recipient_count int not null default 0,
  ref_table text,                            -- tabla relacionada (p.ej. 'promotions')
  ref_id uuid,                               -- id relacionado
  resend_id text,                            -- id del mensaje en Resend
  sent_by uuid references sales_reps(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_client_email_log_account on client_email_log (account_id, created_at desc);
create index if not exists idx_client_email_log_kind on client_email_log (kind, created_at desc);

alter table client_email_log enable row level security;

-- Lectura: admin todo; vendedor ve los de sus cuentas o los que él mismo envió.
drop policy if exists client_email_log_select on client_email_log;
create policy client_email_log_select on client_email_log
  for select using (
    public.is_admin()
    or sent_by = public.current_rep_id()
    or account_id in (select id from public.accounts where assigned_rep_id = public.current_rep_id())
  );

-- Escritura: cualquier usuario autenticado (los envíos los hace el vendedor/admin
-- de su sesión; los endpoints ya validan el acceso a la cuenta vía RLS de accounts).
drop policy if exists client_email_log_insert on client_email_log;
create policy client_email_log_insert on client_email_log
  for insert with check (auth.uid() is not null);

comment on table client_email_log is
  'Bitácora de correos enviados a clientes para registrar el último envío por cuenta/tipo.';
