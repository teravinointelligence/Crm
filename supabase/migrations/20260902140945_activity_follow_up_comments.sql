-- Conversaciones de seguimiento vinculadas a una actividad comercial.
-- La nota original permanece en activities.notes; este historial es aditivo
-- e inmutable desde la aplicación para conservar autoría y contexto.
create table public.activity_comments (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null
    references public.activities(id) on delete cascade,
  author_rep_id uuid not null
    references public.sales_reps(id) on delete restrict,
  body text not null,
  created_at timestamptz not null default now(),
  constraint activity_comments_body_length
    check (char_length(btrim(body)) between 1 and 2000)
);

create index activity_comments_activity_created_idx
  on public.activity_comments (activity_id, created_at);

alter table public.activity_comments enable row level security;

-- Las concesiones de tabla y RLS son capas distintas. Se revocan los defaults
-- para exponer únicamente lectura y alta a sesiones autenticadas.
revoke all on table public.activity_comments from anon, authenticated;
grant select, insert on table public.activity_comments to authenticated;
grant all privileges on table public.activity_comments to service_role;

create policy activity_comments_select
  on public.activity_comments
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.activities activity
      where activity.id = activity_comments.activity_id
        and (
          (select public.is_admin())
          or activity.sales_rep_id = (select public.current_rep_id())
          or exists (
            select 1
            from public.accounts account
            where account.id = activity.account_id
              and account.assigned_rep_id = (select public.current_rep_id())
          )
        )
    )
  );

create policy activity_comments_insert
  on public.activity_comments
  for insert
  to authenticated
  with check (
    author_rep_id = (select public.current_rep_id())
    and exists (
      select 1
      from public.activities activity
      where activity.id = activity_comments.activity_id
        and (
          (select public.is_admin())
          or activity.sales_rep_id = (select public.current_rep_id())
          or exists (
            select 1
            from public.accounts account
            where account.id = activity.account_id
              and account.assigned_rep_id = (select public.current_rep_id())
          )
        )
    )
  );

comment on table public.activity_comments is
  'Historial colaborativo de seguimiento para actividades comerciales.';

notify pgrst, 'reload schema';
