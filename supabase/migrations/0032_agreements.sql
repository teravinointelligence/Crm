-- =====================================================================
-- ACUERDOS POR EMPRESA (bitácora cronológica)
-- =====================================================================
-- Registro cronológico de los acuerdos comerciales con cada cuenta:
-- comodatos (cavas, equipo Coravin), precios especiales, consignación,
-- exclusividad, etc. Cada acuerdo puede:
--   * generar un PDF con marca Teravino (a partir de los datos capturados), y/o
--   * guardar el PDF firmado escaneado (bucket privado 'acuerdos').
-- Se ve en la ficha de la empresa, ordenado por fecha (más reciente primero).
-- =====================================================================

create table if not exists public.agreements (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references public.accounts(id) on delete cascade not null,
  agreement_date date not null default current_date,
  title text not null,
  description text,
  type text not null default 'otro' check (type in
    ('comodato','precio_especial','consignacion','exclusividad','volumen','otro')),
  status text not null default 'vigente' check (status in
    ('vigente','vencido','cancelado')),
  -- Condiciones comerciales (todas opcionales).
  price_notes text,            -- lista de precios / condiciones de precio en texto
  discount_pct numeric(5,2),   -- descuento pactado, p.ej. 10.00
  credit_days int,             -- días de crédito pactados
  valid_from date,
  valid_until date,
  -- Con quién se pactó y quién lo cerró.
  contact_id uuid references public.contacts(id) on delete set null,
  rep_id uuid references public.sales_reps(id) on delete set null,
  -- PDF firmado subido (ruta en bucket 'acuerdos'): <account_id>/<agreement_id>/<archivo>.
  document_path text,
  document_uploaded_at timestamptz,
  created_by uuid references public.sales_reps(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_agreements_account on public.agreements(account_id);
create index if not exists idx_agreements_date on public.agreements(agreement_date desc);
create index if not exists idx_agreements_status on public.agreements(status);

drop trigger if exists set_updated_at on public.agreements;
create trigger set_updated_at before update on public.agreements
  for each row execute function public.tg_set_updated_at();

-- ---------------------------------------------------------------------
-- EQUIPO A COMODATO por acuerdo (cavas, Coravin, etc.)
-- ---------------------------------------------------------------------
create table if not exists public.agreement_equipment (
  id uuid primary key default gen_random_uuid(),
  agreement_id uuid references public.agreements(id) on delete cascade not null,
  kind text not null default 'otro' check (kind in
    ('cava','coravin','enfriador','mueble','otro')),
  description text not null,
  quantity int not null default 1 check (quantity > 0),
  serial text,                 -- número de serie / inventario
  status text not null default 'prestado' check (status in
    ('prestado','devuelto')),
  returned_at date,
  created_at timestamptz default now()
);

create index if not exists idx_agreement_equipment_agreement
  on public.agreement_equipment(agreement_id);

-- ---------------------------------------------------------------------
-- RLS — alcance por cuenta (igual que contacts): admin o vendedor
-- asignado a la cuenta pueden todo; contador (can_read_all) sólo lee.
-- ---------------------------------------------------------------------
alter table public.agreements enable row level security;
alter table public.agreement_equipment enable row level security;

drop policy if exists agreements_rw on public.agreements;
create policy agreements_rw on public.agreements
  for all using (
    public.is_admin() or exists (
      select 1 from public.accounts a
      where a.id = agreements.account_id
        and a.assigned_rep_id = public.current_rep_id()
    )
  ) with check (
    public.is_admin() or exists (
      select 1 from public.accounts a
      where a.id = agreements.account_id
        and a.assigned_rep_id = public.current_rep_id()
    )
  );

drop policy if exists agreements_finance_read on public.agreements;
create policy agreements_finance_read on public.agreements
  for select using (public.can_read_all());

drop policy if exists agreement_equipment_rw on public.agreement_equipment;
create policy agreement_equipment_rw on public.agreement_equipment
  for all using (
    public.is_admin() or exists (
      select 1 from public.agreements ag
      join public.accounts a on a.id = ag.account_id
      where ag.id = agreement_equipment.agreement_id
        and a.assigned_rep_id = public.current_rep_id()
    )
  ) with check (
    public.is_admin() or exists (
      select 1 from public.agreements ag
      join public.accounts a on a.id = ag.account_id
      where ag.id = agreement_equipment.agreement_id
        and a.assigned_rep_id = public.current_rep_id()
    )
  );

drop policy if exists agreement_equipment_finance_read on public.agreement_equipment;
create policy agreement_equipment_finance_read on public.agreement_equipment
  for select using (public.can_read_all());

-- ---------------------------------------------------------------------
-- STORAGE — bucket privado para los PDFs firmados.
-- Ruta: <account_id>/<agreement_id>/<archivo>. El primer folder (account_id)
-- valida RLS contra la cuenta asignada.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
  values ('acuerdos', 'acuerdos', false)
  on conflict (id) do nothing;

drop policy if exists acuerdos_select on storage.objects;
create policy acuerdos_select on storage.objects for select using (
  bucket_id = 'acuerdos'
  and (
    public.can_read_all() or exists (
      select 1 from public.accounts a
      where a.id = ((storage.foldername(name))[1])::uuid
        and a.assigned_rep_id = public.current_rep_id()
    )
  )
);

drop policy if exists acuerdos_insert on storage.objects;
create policy acuerdos_insert on storage.objects for insert with check (
  bucket_id = 'acuerdos'
  and (
    public.is_admin() or exists (
      select 1 from public.accounts a
      where a.id = ((storage.foldername(name))[1])::uuid
        and a.assigned_rep_id = public.current_rep_id()
    )
  )
);

drop policy if exists acuerdos_update on storage.objects;
create policy acuerdos_update on storage.objects for update using (
  bucket_id = 'acuerdos'
  and (
    public.is_admin() or exists (
      select 1 from public.accounts a
      where a.id = ((storage.foldername(name))[1])::uuid
        and a.assigned_rep_id = public.current_rep_id()
    )
  )
) with check (
  bucket_id = 'acuerdos'
  and (
    public.is_admin() or exists (
      select 1 from public.accounts a
      where a.id = ((storage.foldername(name))[1])::uuid
        and a.assigned_rep_id = public.current_rep_id()
    )
  )
);

drop policy if exists acuerdos_delete on storage.objects;
create policy acuerdos_delete on storage.objects for delete using (
  bucket_id = 'acuerdos'
  and (
    public.is_admin() or exists (
      select 1 from public.accounts a
      where a.id = ((storage.foldername(name))[1])::uuid
        and a.assigned_rep_id = public.current_rep_id()
    )
  )
);
