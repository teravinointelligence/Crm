-- =====================================================================
-- Folio de muestras atómico (arregla "duplicate key ... request_number")
-- =====================================================================
-- Antes el formulario llamaba next_sample_number() (max+1) en una petición y
-- hacía el INSERT en otra: dos envíos casi simultáneos (doble-clic / reintento)
-- obtenían el mismo folio y el segundo violaba la constraint única.
-- Ahora el folio se asigna dentro del propio INSERT, bajo un advisory lock por
-- transacción, así los inserts concurrentes se serializan y nunca colisionan.
-- =====================================================================
create or replace function public.tg_sample_set_number()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_year text; v_next int;
begin
  perform pg_advisory_xact_lock(hashtext('sample_request_number'));
  v_year := to_char(current_date, 'YYYY');
  select coalesce(max(substring(request_number from '\d+$')::int), 0) + 1 into v_next
    from public.sample_requests where request_number like 'MUE-' || v_year || '-%';
  new.request_number := 'MUE-' || v_year || '-' || lpad(v_next::text, 4, '0');
  return new;
end;
$$;

-- Prefijo aaa_ para que asigne el número antes que los demás triggers BEFORE INSERT.
drop trigger if exists aaa_sample_set_number on public.sample_requests;
create trigger aaa_sample_set_number
  before insert on public.sample_requests
  for each row execute function public.tg_sample_set_number();
