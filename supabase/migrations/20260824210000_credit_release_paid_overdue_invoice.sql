-- Crédito liberado: una cuenta califica únicamente cuando, durante los últimos
-- 30 días, terminó de pagar una factura que ya estaba vencida al aplicar el pago.
-- La vista une pagos ligados directamente a una factura y pagos distribuidos
-- mediante payment_allocations.
create or replace view public.v_account_credit_release
with (security_invoker = on) as
with applied_payments as (
  select
    p.account_id,
    p.payment_date,
    i.id as invoice_id,
    i.invoice_date,
    i.due_date,
    i.payment_terms_days,
    i.balance,
    i.status
  from public.payments p
  join public.invoices i on i.id = p.invoice_id
  where coalesce(p.confirmado, true)

  union

  select
    p.account_id,
    p.payment_date,
    i.id as invoice_id,
    i.invoice_date,
    i.due_date,
    i.payment_terms_days,
    i.balance,
    i.status
  from public.payments p
  join public.payment_allocations pa
    on pa.payment_id = p.id
   and pa.amount_applied > 0
  join public.invoices i on i.id = pa.invoice_id
  where coalesce(p.confirmado, true)
)
select
  account_id,
  max(payment_date) as last_qualifying_payment_date
from applied_payments
where payment_date >= current_date - 30
  and coalesce(due_date, invoice_date + coalesce(payment_terms_days, 0)) < payment_date
  and (coalesce(balance, 0) <= 0 or status = 'pagada')
group by account_id;

grant select on public.v_account_credit_release to authenticated;

comment on view public.v_account_credit_release is
  'Cuentas con crédito liberado por haber pagado una factura vencida en los últimos 30 días.';
