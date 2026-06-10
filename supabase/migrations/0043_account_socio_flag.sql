-- 0043: Cuentas "socio" de Teravino — excluidas de la cartera VENCIDA.
--
-- Una cuenta socio sigue mostrando su saldo pendiente (lo que se le facturó),
-- pero su saldo VENCIDO se reporta como 0 en v_account_balance. Como casi todo
-- el CRM lee el "vencido" de esta vista (dashboard, página de Cartera, Reportes,
-- export a Excel, correos de cobranza y el semáforo), excluirlo aquí lo saca de
-- todos esos lugares de un solo cambio. NO se les manda cobranza por vencido.

alter table public.accounts
  add column if not exists es_socio boolean not null default false;

comment on column public.accounts.es_socio is
  'Cuenta de un socio de Teravino: se excluye de la cartera vencida (totales, semáforo y cobranza).';

-- Socios actuales (por # de cliente CONTPAQi): BREW WINES, Camverto, Eno Vino, Vernazza.
update public.accounts set es_socio = true
where client_number in ('14', '38', '49', '175');

-- Recrea la vista: saldo_vencido = 0 para socios; expone es_socio para la UI.
create or replace view public.v_account_balance as
select
  a.id as account_id,
  a.business_name,
  a.region,
  a.assigned_rep_id,
  coalesce(sum(i.total), 0) as total_facturado,
  coalesce(sum(i.total_paid), 0) as total_pagado,
  coalesce(sum(i.balance), 0) as saldo_pendiente,
  case
    when a.es_socio then 0
    else coalesce(sum(case when i.due_date < current_date and i.balance > 0
                           then i.balance else 0 end), 0)
  end as saldo_vencido,
  count(case when i.status in ('pendiente', 'pagada_parcial', 'vencida') then 1 end) as facturas_abiertas,
  a.es_socio
from public.accounts a
left join public.invoices i on i.account_id = a.id and i.status <> 'cancelada'
group by a.id, a.business_name, a.region, a.assigned_rep_id, a.es_socio;
