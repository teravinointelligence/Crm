-- =====================================================================
-- CUMPLEAÑOS DE CONTACTOS + recordatorio de "próximos cumpleaños"
-- =====================================================================
-- Guarda la fecha de cumpleaños de cada contacto para recordarnos enviarles
-- un detalle. La vista v_upcoming_birthdays calcula el próximo cumpleaños y
-- los días que faltan; se usa en el Dashboard. La vista es security_invoker,
-- así que respeta la RLS de contacts/accounts (cada vendedor ve los suyos;
-- admin/contador ven todos).
-- =====================================================================

alter table public.contacts add column if not exists birthday date;

create or replace view public.v_upcoming_birthdays
with (security_invoker = true) as
select
  x.contact_id,
  x.account_id,
  x.full_name,
  x.role,
  x.phone,
  x.whatsapp,
  x.email,
  x.birthday,
  x.business_name,
  x.region,
  x.assigned_rep_id,
  x.next_birthday,
  (x.next_birthday - current_date) as days_until
from (
  select
    c.id as contact_id,
    c.account_id,
    c.full_name,
    c.role,
    c.phone,
    c.whatsapp,
    c.email,
    c.birthday,
    a.business_name,
    a.region,
    a.assigned_rep_id,
    -- Próxima ocurrencia del cumpleaños (este año si aún no pasa, si no el
    -- siguiente). El 29-feb se trata como 28-feb para no romper en años no
    -- bisiestos.
    (case
       when to_char(c.birthday, 'MMDD') >= to_char(current_date, 'MMDD')
         then make_date(
                extract(year from current_date)::int,
                extract(month from c.birthday)::int,
                case when extract(month from c.birthday) = 2 and extract(day from c.birthday) = 29
                     then 28 else extract(day from c.birthday)::int end)
       else make_date(
                extract(year from current_date)::int + 1,
                extract(month from c.birthday)::int,
                case when extract(month from c.birthday) = 2 and extract(day from c.birthday) = 29
                     then 28 else extract(day from c.birthday)::int end)
     end) as next_birthday
  from public.contacts c
  join public.accounts a on a.id = c.account_id
  where c.birthday is not null
) x;
