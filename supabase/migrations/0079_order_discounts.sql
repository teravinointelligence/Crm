-- =====================================================================
-- Descuentos en cotizaciones/pedidos (global, en %) + autorización admin
-- =====================================================================
-- Un descuento GLOBAL en porcentaje sobre el subtotal de la orden.
--   • Vendedor: puede aplicar hasta el límite (5%). Arriba de eso, el
--     descuento queda 'pendiente' y NO se aplica al total hasta que un admin
--     lo autorice.
--   • Admin: cualquier % queda 'autorizado' de inmediato.
-- El total guardado SIEMPRE refleja solo el descuento EFECTIVO (autorizado o
-- auto dentro de límite); un descuento pendiente/rechazado no descuenta nada.
--
-- La regla se aplica en un TRIGGER (no solo en el cliente): aunque el front
-- mande otra cosa, el server normaliza estado/monto/IVA/total. Así un vendedor
-- no puede auto-autorizarse arriba del límite ni falsear el total.
-- =====================================================================

alter table public.orders
  add column if not exists discount_pct numeric(5,2) not null default 0,
  add column if not exists discount_amount numeric(12,2) not null default 0,
  add column if not exists discount_status text not null default 'none'
    check (discount_status in ('none','pendiente','autorizado','rechazado')),
  add column if not exists discount_requested_by uuid references public.sales_reps(id),
  add column if not exists discount_authorized_by uuid references public.sales_reps(id),
  add column if not exists discount_authorized_at timestamptz,
  add column if not exists discount_note text;

create index if not exists idx_orders_discount_pendiente
  on public.orders(discount_status) where discount_status = 'pendiente';

-- Normaliza descuento + recalcula IVA/total a partir del subtotal. El límite
-- de autoaprobación para no-admin es 5%.
create or replace function public.tg_orders_discount()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_limit constant numeric := 5;       -- % máximo que un vendedor puede aplicar sin autorización
  v_admin boolean := public.is_admin();
  v_pct numeric;
  v_sub numeric := coalesce(new.subtotal, 0);
begin
  v_pct := coalesce(new.discount_pct, 0);
  if v_pct < 0 then v_pct := 0; end if;
  if v_pct > 100 then v_pct := 100; end if;
  new.discount_pct := v_pct;

  if v_pct = 0 then
    new.discount_status := 'none';
  elsif v_admin then
    -- El admin manda: autorizado, salvo que esté marcando explícitamente rechazo.
    if new.discount_status is distinct from 'rechazado' then
      new.discount_status := 'autorizado';
    end if;
  else
    -- No-admin: dentro del límite se autoriza solo; arriba, queda pendiente,
    -- a menos que ya estuviera autorizado por un admin con el mismo %.
    if v_pct <= v_limit then
      new.discount_status := 'autorizado';
    elsif tg_op = 'UPDATE' and old.discount_status = 'autorizado'
          and old.discount_pct = v_pct then
      new.discount_status := 'autorizado';
    else
      new.discount_status := 'pendiente';
    end if;
  end if;

  -- Monto efectivo: solo si quedó autorizado.
  if new.discount_status = 'autorizado' then
    new.discount_amount := round(v_sub * new.discount_pct / 100.0, 2);
  else
    new.discount_amount := 0;
    new.discount_authorized_by := null;
    new.discount_authorized_at := null;
  end if;

  new.iva := round((v_sub - new.discount_amount) * 0.16, 2);
  new.total := round(v_sub - new.discount_amount + new.iva, 2);
  return new;
end;
$$;

drop trigger if exists trg_orders_discount on public.orders;
create trigger trg_orders_discount
  before insert or update on public.orders
  for each row execute function public.tg_orders_discount();
