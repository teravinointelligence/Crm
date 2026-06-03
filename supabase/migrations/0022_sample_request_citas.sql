-- Muestras ligadas a citas agendadas.
-- Regla de negocio: para ENVIAR una solicitud de muestra, el vendedor debe
-- adjuntar al menos 3 citas (activities con status 'agendada') de 3 clientes
-- distintos. Una misma muestra "alcanza" para >= 3 citas. El Admin queda exento.

-- 1. Tabla puente solicitud <-> cita
create table if not exists public.sample_request_activities (
  id uuid primary key default gen_random_uuid(),
  request_id uuid references public.sample_requests(id) on delete cascade not null,
  activity_id uuid references public.activities(id) on delete restrict not null,
  created_at timestamptz default now(),
  unique (request_id, activity_id)
);
create index if not exists idx_sample_request_activities_req on public.sample_request_activities(request_id);
create index if not exists idx_sample_request_activities_act on public.sample_request_activities(activity_id);

alter table public.sample_request_activities enable row level security;

drop policy if exists sample_request_activities_all on public.sample_request_activities;
create policy sample_request_activities_all on public.sample_request_activities
  for all using (
    public.is_admin() or exists (
      select 1 from public.sample_requests r
      where r.id = sample_request_activities.request_id
        and r.sales_rep_id = public.current_rep_id()
    )
  ) with check (
    public.is_admin() or exists (
      select 1 from public.sample_requests r
      where r.id = sample_request_activities.request_id
        and r.sales_rep_id = public.current_rep_id()
    )
  );

-- 2. Candado: una solicitud solo se puede ENVIAR si cubre >= 3 citas agendadas
--    de clientes distintos. Solo cuentan citas presenciales. El Admin queda exento.
create or replace function public.tg_sample_requires_citas()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_min constant int := 3;  -- mínimo de clientes distintos por muestra
  v_distinct int;
begin
  if new.status = 'enviada'
     and (tg_op = 'INSERT' or old.status is distinct from 'enviada')
     and not public.is_admin() then
    select count(distinct a.account_id) into v_distinct
    from public.sample_request_activities sra
    join public.activities a on a.id = sra.activity_id
    where sra.request_id = new.id
      and a.status = 'agendada'
      and a.account_id is not null
      and a.activity_type in ('visita', 'degustacion', 'reunion', 'evento');
    if coalesce(v_distinct, 0) < v_min then
      raise exception 'Una muestra requiere al menos % citas agendadas con clientes distintos (tiene %).', v_min, coalesce(v_distinct, 0)
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sample_requires_citas on public.sample_requests;
create trigger trg_sample_requires_citas
  before insert or update on public.sample_requests
  for each row execute function public.tg_sample_requires_citas();
