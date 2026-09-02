-- Notas libres del vendedor, con etiquetas a cuentas y contactos.
--
-- Hasta ahora todo lo que el vendedor escribía tenía que colgar de algo: una
-- actividad, una cuenta, un pedido. No había dónde anotar "en el Marriott me
-- dijeron que el chef nuevo entra en septiembre" sin inventarse una actividad.
--
-- Una nota es texto libre. Opcionalmente se etiqueta a una o varias cuentas y
-- contactos (escribiendo @ en el CRM), y así aparece también en la ficha de esa
-- cuenta. Sin etiquetas es una nota personal del vendedor.

create table if not exists public.rep_notes (
  id uuid primary key default gen_random_uuid(),
  sales_rep_id uuid not null references public.sales_reps(id) on delete cascade,
  body text not null check (length(btrim(body)) > 0),
  -- Fijar una nota la mantiene arriba (pendientes que no son tarea).
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists rep_notes_rep_idx
  on public.rep_notes(sales_rep_id, created_at desc);

-- Etiquetas. Tabla puente en vez de un array de uuid para poder preguntar
-- "¿qué notas tiene esta cuenta?" desde la ficha del cliente con un índice.
create table if not exists public.rep_note_links (
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null references public.rep_notes(id) on delete cascade,
  account_id uuid references public.accounts(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete cascade,
  created_at timestamptz not null default now(),
  -- Cada fila etiqueta exactamente una cosa.
  constraint rep_note_links_one_target check (
    (account_id is not null)::int + (contact_id is not null)::int = 1
  )
);

create index if not exists rep_note_links_note_idx on public.rep_note_links(note_id);
create index if not exists rep_note_links_account_idx
  on public.rep_note_links(account_id) where account_id is not null;
create index if not exists rep_note_links_contact_idx
  on public.rep_note_links(contact_id) where contact_id is not null;

-- No etiquetar dos veces lo mismo en la misma nota.
create unique index if not exists rep_note_links_account_uidx
  on public.rep_note_links(note_id, account_id) where account_id is not null;
create unique index if not exists rep_note_links_contact_uidx
  on public.rep_note_links(note_id, contact_id) where contact_id is not null;

drop trigger if exists set_updated_at on public.rep_notes;
create trigger set_updated_at before update on public.rep_notes
  for each row execute function public.tg_set_updated_at();

-- ---------------------------------------------------------------------
-- Cuándo se cerró un siguiente paso.
--
-- `next_step_done` solo dice "sí o no". En "Mi día" lo que se completa se
-- queda en pantalla en verde hasta el día siguiente, y para eso hace falta
-- saber CUÁNDO se cerró: si no, un paso vencido que cierras hoy desaparecería
-- de la lista en el mismo instante en que lo marcas.
-- ---------------------------------------------------------------------
alter table public.activities
  add column if not exists next_step_done_at timestamptz;

-- Los que ya estaban cerrados no tienen fecha real; se deja nula a propósito
-- (mentir con una fecha inventada sería peor) y por tanto no salen en "hechas
-- hoy", que es justo lo que queremos.
create index if not exists idx_activities_next_step_done_at
  on public.activities(next_step_done_at)
  where next_step_done_at is not null;

-- ---------------------------------------------------------------------
-- RLS. Una nota es del vendedor que la escribió: solo él (y admin) la ve,
-- la edita y la borra. Etiquetar una cuenta NO se la comparte a nadie más.
-- ---------------------------------------------------------------------
alter table public.rep_notes enable row level security;
alter table public.rep_note_links enable row level security;

drop policy if exists rep_notes_all on public.rep_notes;
create policy rep_notes_all on public.rep_notes
  for all using (
    public.is_admin() or sales_rep_id = public.current_rep_id()
  ) with check (
    public.is_admin() or sales_rep_id = public.current_rep_id()
  );

-- Las etiquetas heredan el permiso de su nota.
drop policy if exists rep_note_links_all on public.rep_note_links;
create policy rep_note_links_all on public.rep_note_links
  for all using (
    exists (
      select 1 from public.rep_notes n
      where n.id = rep_note_links.note_id
        and (public.is_admin() or n.sales_rep_id = public.current_rep_id())
    )
  ) with check (
    exists (
      select 1 from public.rep_notes n
      where n.id = rep_note_links.note_id
        and (public.is_admin() or n.sales_rep_id = public.current_rep_id())
    )
  );
