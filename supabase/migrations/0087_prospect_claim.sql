-- Mecanismo de "claim" de prospectos: el primero que registra un prospecto se lo
-- queda; nadie más puede volver a registrar el mismo negocio en la misma zona; y
-- un vendedor solo puede registrar dentro de su propia zona (admin en cualquiera).
--
-- Decisiones de producto:
--   * Duplicado = mismo nombre de negocio NORMALIZADO dentro de la misma región.
--   * El choque se evalúa contra CUALQUIER cuenta existente (prospecto o cliente),
--     no solo contra otros prospectos.
--   * No se agrega índice único a nivel tabla: hay duplicados legacy y cuentas con
--     región nula que lo romperían. La atomicidad la da el advisory lock dentro de
--     la RPC (mismo patrón que create_order en 0086).

-- Quién registró el prospecto (el dueño operativo sigue siendo assigned_rep_id).
alter table public.accounts
  add column if not exists created_by uuid references public.sales_reps(id) on delete set null;

-- Normaliza un nombre de negocio: minúsculas, sin acentos, solo [a-z0-9].
--   "Café  Düna, S.A." -> "cafedunasa"
create or replace function public.norm_nombre(p text)
returns text
language sql
immutable
as $$
  select regexp_replace(
           translate(
             lower(coalesce(p, '')),
             'áàäâãéèëêíìïîóòöôõúùüûñç',
             'aaaaaeeeeiiiiooooouuuunc'
           ),
           '[^a-z0-9]+', '', 'g'
         );
$$;

-- Registra (claim) un prospecto de forma atómica.
-- Devuelve jsonb con uno de estos status:
--   {status:'registrado', account_id}
--   {status:'tomado', account_id, dueno, estatus, zona}   -- ya existía
--   {status:'zona_invalida', tu_zona}                     -- vendedor fuera de su zona
--   {status:'error', reason}
create or replace function public.claim_prospect(
  p_business_name    text,
  p_region           text,
  p_account_type     text default null,
  p_city             text default null,
  p_phone            text default null,
  p_email            text default null,
  p_notes            text default null,
  p_assigned_rep_id  uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller   uuid    := public.current_rep_id();
  v_admin    boolean := public.is_admin();
  v_my_zone  text;
  v_owner    uuid;
  v_name     text    := nullif(btrim(coalesce(p_business_name, '')), '');
  v_norm     text;
  v_existing record;
  v_notes    text;
  v_new_id   uuid;
begin
  if v_caller is null then
    return jsonb_build_object('status', 'error', 'reason', 'sin_sesion');
  end if;
  if v_name is null then
    return jsonb_build_object('status', 'error', 'reason', 'nombre_vacio');
  end if;
  if nullif(btrim(coalesce(p_region, '')), '') is null then
    return jsonb_build_object('status', 'error', 'reason', 'zona_requerida');
  end if;

  -- Dueño del prospecto: admin puede asignarlo a otro vendedor; el vendedor
  -- siempre se lo queda él mismo.
  if v_admin then
    v_owner := coalesce(p_assigned_rep_id, v_caller);
  else
    v_owner := v_caller;
    -- Regla de zona: el vendedor solo registra prospectos de su propia zona.
    select primary_region into v_my_zone from public.sales_reps where id = v_caller;
    if p_region is distinct from v_my_zone then
      return jsonb_build_object('status', 'zona_invalida', 'tu_zona', v_my_zone);
    end if;
  end if;

  v_norm := public.norm_nombre(v_name);
  if v_norm = '' then
    return jsonb_build_object('status', 'error', 'reason', 'nombre_invalido');
  end if;

  -- Serializa el claim por (nombre normalizado, zona) para cerrar la carrera de
  -- dos personas registrando el mismo negocio al mismo tiempo.
  perform pg_advisory_xact_lock(hashtext(v_norm || '|' || p_region));

  -- ¿Ya existe CUALQUIER cuenta con ese nombre en esa zona? (security definer
  -- bypassa el RLS para poder avisar quién lo tiene, aunque el solicitante no la vea).
  select a.id, a.status, r.full_name as rep_name
    into v_existing
  from public.accounts a
  left join public.sales_reps r on r.id = a.assigned_rep_id
  where a.region = p_region
    and public.norm_nombre(a.business_name) = v_norm
  limit 1;

  if found then
    return jsonb_build_object(
      'status',    'tomado',
      'account_id', v_existing.id,
      'dueno',     coalesce(v_existing.rep_name, 'sin asignar'),
      'estatus',   v_existing.status,
      'zona',      p_region
    );
  end if;

  -- accounts no tiene columnas de teléfono/correo; si vienen, los anexamos a notas.
  v_notes := nullif(btrim(
    concat_ws(E'\n',
      nullif(btrim(coalesce(p_notes, '')), ''),
      case when nullif(btrim(coalesce(p_phone, '')), '') is not null
           then 'Tel: ' || btrim(p_phone) end,
      case when nullif(btrim(coalesce(p_email, '')), '') is not null
           then 'Correo: ' || btrim(p_email) end
    )
  ), '');

  insert into public.accounts (
    business_name, account_type, region, city, notes, status,
    assigned_rep_id, created_by, price_tier
  ) values (
    v_name,
    nullif(btrim(coalesce(p_account_type, '')), ''),
    p_region,
    nullif(btrim(coalesce(p_city, '')), ''),
    v_notes,
    'prospecto',
    v_owner,
    v_caller,
    case when p_region in ('La Paz', 'Tijuana') then '+10' else 'base' end
  )
  returning id into v_new_id;

  return jsonb_build_object('status', 'registrado', 'account_id', v_new_id);
end;
$$;
