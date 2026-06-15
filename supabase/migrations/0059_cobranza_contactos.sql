-- ---------------------------------------------------------------------
-- Bitácora de contactos de cobranza
-- Registra cada gesto de cobranza (correo / WhatsApp) hecho desde
-- "Cobranza de hoy" o desde la ficha del estado de cuenta: a quién, por
-- qué canal, con qué tono y qué texto. El envío real puede estar detrás de
-- un flag (COBRANZA_ENVIO_REAL); este registro existe SIEMPRE, aunque el
-- correo solo se haya abierto en el cliente del usuario (mailto / wa.me).
--
-- Alimenta el score de priorización: si una cuenta ya fue contactada hace
-- poco, baja su urgencia para no acosar al cliente.
-- ---------------------------------------------------------------------

create table if not exists public.collection_contacts (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references public.accounts(id) on delete cascade not null,
  channel text not null check (channel in ('email','whatsapp')),
  tono text check (tono in ('amable','firme','formal')),
  recipient text,                       -- correo o teléfono al que se dirigió
  subject text,                         -- asunto (solo correo)
  body text,                            -- texto final que aprobó la persona
  status text not null default 'registrado'
    check (status in ('registrado','enviado')),
  sent_via text check (sent_via in ('mailto','whatsapp','resend')),
  saldo_vencido numeric(14,2),          -- foto del vencido al momento del contacto
  dias_vencido int,
  created_by uuid references public.sales_reps(id),
  created_at timestamptz default now()
);

create index if not exists collection_contacts_account_idx
  on public.collection_contacts (account_id, created_at desc);

alter table public.collection_contacts enable row level security;

-- Cobranza es función de admin/contador (can_read_all). A diferencia del resto
-- del CRM, aquí el contador SÍ escribe (registrar un contacto es parte de su
-- trabajo), por eso la policy cubre select + insert con el mismo predicado.
drop policy if exists collection_contacts_finance on public.collection_contacts;
create policy collection_contacts_finance on public.collection_contacts
  for all using (public.can_read_all()) with check (public.can_read_all());
