-- =====================================================================
-- Tránsito / Cuentas por Pagar — helpers
-- =====================================================================

create or replace function public.refresh_po_payment_status(p_po_id uuid)
returns void language plpgsql set search_path = public as $$
declare v purchase_orders%rowtype;
begin
  select * into v from public.purchase_orders where id = p_po_id;
  if not found then return; end if;
  if v.status = 'cancelada' then return; end if;
  update public.purchase_orders set payment_status = case
    when v.supplier_invoice_number is null then 'sin_facturar'
    when coalesce(v.total_paid,0) >= coalesce(v.total,0) and coalesce(v.total,0) > 0 then 'pagada'
    when coalesce(v.total_paid,0) > 0 and v.supplier_invoice_due_date is not null and v.supplier_invoice_due_date < current_date then 'vencida'
    when coalesce(v.total_paid,0) > 0 then 'pagada_parcial'
    when v.supplier_invoice_due_date is not null and v.supplier_invoice_due_date < current_date then 'vencida'
    else 'pendiente'
  end where id = p_po_id;
end;
$$;

create or replace function public.register_supplier_payment(
  p_po_id uuid, p_amount numeric, p_payment_date date, p_method text,
  p_reference text, p_notes text, p_paid_by uuid
) returns uuid language plpgsql set search_path = public as $$
declare v_id uuid; v_supplier text;
begin
  select supplier into v_supplier from public.purchase_orders where id = p_po_id;
  insert into public.supplier_payments (po_id, supplier, payment_date, amount, method, reference, notes, paid_by)
    values (p_po_id, coalesce(v_supplier,'?'), p_payment_date, p_amount, p_method, p_reference, p_notes, p_paid_by)
    returning id into v_id;
  update public.purchase_orders set total_paid = coalesce(total_paid,0) + p_amount where id = p_po_id;
  perform public.refresh_po_payment_status(p_po_id);
  return v_id;
end;
$$;

-- NOTE: La importación de 332 cuentas reales desde HubSpot se aplicó como
-- migraciones de datos one-off (0007_import_hubspot_companies_b1..b3 en el
-- proyecto remoto). No se incluyen aquí por tamaño; los IDs de HubSpot quedan
-- en accounts.hubspot_company_id para re-sincronización idempotente.
