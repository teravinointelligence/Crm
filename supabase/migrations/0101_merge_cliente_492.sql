-- =====================================================================
-- 0101 — Fusión de la ficha duplicada del cliente 492
-- =====================================================================
-- El import de CONTPAQi creó una segunda cuenta con client_number 492
-- ("SUITES OPERADORA DEL PACIFICO", la razón social) mientras la operación
-- comercial vivía en la ficha "Grand Velas Riviera Nayarit" (nombre
-- comercial). Resultado: la facturación y las ventas mensuales quedaron en
-- un expediente y los contactos/actividades en el otro, así que la ficha que
-- consulta el vendedor mostraba saldo $0, sin facturas y sin historial de
-- compra pese a $53,383.38 facturados entre junio y agosto 2026.
--
-- Se conserva la ficha de Grand Velas (tiene contactos, actividades, región,
-- tipo de cuenta y hubspot_company_id) y se le integra el historial fiscal.
-- La ficha duplicada NO se borra: se neutraliza (sin client_number, inactiva
-- y renombrada) para no perder la trazabilidad del import.
--
-- Idempotente: si el duplicado ya no existe o ya fue neutralizado, no hace
-- nada. Guardado por id porque ambos registros compartían el mismo número.
-- =====================================================================

do $$
declare
  v_keep uuid := '15d2d70f-21e8-4c16-88eb-4c0180326fb2'; -- Grand Velas Riviera Nayarit
  v_dup  uuid := 'e8561040-434b-4e32-a92c-2a3795be921d'; -- SUITES OPERADORA DEL PACIFICO (import)
begin
  if not exists (select 1 from public.accounts where id = v_dup)
     or not exists (select 1 from public.accounts where id = v_keep) then
    return;
  end if;

  -- 1. Historial fiscal y comercial al expediente que conserva la operación.
  update public.invoices      set account_id = v_keep where account_id = v_dup;
  update public.payments      set account_id = v_keep where account_id = v_dup;
  update public.monthly_sales set account_id = v_keep where account_id = v_dup;

  -- 2. Razón social y condiciones reales en la ficha superviviente.
  --    credit_days 28 = el pactado según CONTPAQi; los 60 días eran un valor
  --    por defecto del alta manual. El comportamiento de pago lo confirma:
  --    FA15115 se liquidó a 26 días y FA15295 a 7.
  update public.accounts set
    fiscal_name = coalesce(fiscal_name, 'SUITES OPERADORA DEL PACIFICO'),
    credit_days = 28,
    notes = coalesce(notes || E'\n', '') ||
      'Razón social: SUITES OPERADORA DEL PACIFICO (# cliente CONTPAQi 492). ' ||
      'Expediente unificado 2026-08-15: se integró el historial de facturación y ventas ' ||
      'que estaba en una ficha duplicada creada por el import de CONTPAQi.'
  where id = v_keep;

  -- 3. La tarea "Reactivar a SUITES OPERADORA DEL PACIFICO" era un falso
  --    positivo: el generador de inactivos veía el duplicado sin actividad.
  update public.rep_tasks set
    status = 'descartada',
    result_note = 'Duplicado de Grand Velas Riviera Nayarit (# cliente 492); cuenta activa y con facturación al corriente.'
  where account_id = v_dup and status = 'pendiente';

  -- 4. Neutralizar la ficha duplicada sin borrarla.
  update public.accounts set
    client_number = null,
    status = 'inactivo',
    business_name = 'SUITES OPERADORA DEL PACIFICO (duplicado — ver Grand Velas Riviera Nayarit)',
    notes = 'Ficha duplicada creada por el import de CONTPAQi el 2026-06-26. ' ||
            'Su facturación, pagos y ventas se movieron a Grand Velas Riviera Nayarit ' ||
            '(id 15d2d70f-21e8-4c16-88eb-4c0180326fb2) el 2026-08-15. No usar.'
  where id = v_dup;
end $$;
