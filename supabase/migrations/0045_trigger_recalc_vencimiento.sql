-- 0045: Recalcula due_date/status de las facturas cuando cambian los días de crédito.
--
-- v_account_balance ya calcula el vencido en vivo desde credit_days (ver 0044), pero
-- el due_date y el status GUARDADOS por factura no se actualizan solos al cambiar el
-- crédito de una cuenta (los usa el badge por factura y reportes que filtran por status).
-- Antes había que recalcular a mano (p.ej. cuentas #176 y #120). Este trigger lo automatiza.

create or replace function public.recalc_invoice_vencimiento()
returns trigger
language plpgsql
as $$
begin
  -- Solo si realmente cambió el crédito.
  if new.credit_days is distinct from old.credit_days then
    update public.invoices i
    set
      due_date = (i.invoice_date + coalesce(new.credit_days, 0)),
      status = case
        when coalesce(i.balance, 0) <= 0 then 'pagada'
        when (i.invoice_date + coalesce(new.credit_days, 0)) < current_date then 'vencida'
        when coalesce(i.total_paid, 0) > 0 then 'pagada_parcial'
        else 'pendiente'
      end
    where i.account_id = new.id
      and i.status <> 'cancelada'
      and i.invoice_date is not null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_recalc_invoice_vencimiento on public.accounts;
create trigger trg_recalc_invoice_vencimiento
  after update of credit_days on public.accounts
  for each row
  execute function public.recalc_invoice_vencimiento();
