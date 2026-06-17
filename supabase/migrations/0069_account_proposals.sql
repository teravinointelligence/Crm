create table if not exists public.account_proposals (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references public.accounts(id) on delete cascade,
  title       text not null,
  file_url    text not null,
  uploaded_by uuid references public.sales_reps(id),
  created_at  timestamptz not null default now()
);

alter table public.account_proposals enable row level security;

-- Visible to the account's rep and admin/finance
create policy "proposals_select" on public.account_proposals
  for select using (
    exists (
      select 1 from public.sales_reps sr
      where sr.auth_user_id = auth.uid()
        and (
          sr.role in ('admin', 'contador')
          or exists (
            select 1 from public.accounts a
            where a.id = account_proposals.account_id
              and a.assigned_rep_id = sr.id
          )
        )
    )
  );

create policy "proposals_insert" on public.account_proposals
  for insert with check (
    exists (
      select 1 from public.sales_reps sr
      where sr.auth_user_id = auth.uid()
    )
  );

create policy "proposals_delete" on public.account_proposals
  for delete using (
    exists (
      select 1 from public.sales_reps sr
      where sr.auth_user_id = auth.uid()
        and (
          sr.role in ('admin', 'contador')
          or sr.id = account_proposals.uploaded_by
        )
    )
  );
