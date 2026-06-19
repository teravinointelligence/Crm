-- =====================================================================
-- Descuentos: ningún descuento pre-aprobado para vendedores
-- =====================================================================
-- Baja el límite de autoaprobación del vendedor a 0%: CUALQUIER descuento que
-- aplique un no-admin queda 'pendiente' de autorización. Solo el admin aplica
-- descuentos directos (autorizados). Recrea tg_orders_discount (0079) con
-- v_limit = 0. Sincronizar con MAX_VENDOR_DISCOUNT_PCT en lib/pricing.ts.
-- =====================================================================

create or replace function public.tg_orders_discount()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_limit constant numeric := 0;       -- % que un vendedor puede aplicar sin autorización (0 = ninguno)
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
    if new.discount_status is distinct from 'rechazado' then
      new.discount_status := 'autorizado';
    end if;
  else
    if v_pct <= v_limit then
      new.discount_status := 'autorizado';
    elsif tg_op = 'UPDATE' and old.discount_status = 'autorizado'
          and old.discount_pct = v_pct then
      new.discount_status := 'autorizado';
    else
      new.discount_status := 'pendiente';
    end if;
  end if;

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
