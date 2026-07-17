-- Número de cliente CONTPAQ "de muestras" por vendedor.
--
-- En CONTPAQ se creó un cliente por vendedor para registrar la salida de sus
-- muestras (496 Yamile, 497 Alejandra/Andra, 498 Citlali, 499 Felix,
-- 500 Emmanuel). El correo de solicitud de muestras a pedidos@teravino.com
-- incluye este número para que pedidos registre la salida contra ese cliente.

alter table public.sales_reps
  add column if not exists sample_client_number text;

comment on column public.sales_reps.sample_client_number is
  'Número de cliente CONTPAQ para registrar la salida de muestras del vendedor (va en el correo a pedidos@).';

update public.sales_reps as sr
set sample_client_number = x.num
from (values
  ('Yamile', '496'),
  ('Andra Verea', '497'),
  ('Citlali Aguilar', '498'),
  ('Felix', '499'),
  ('Emmanuel', '500')
) as x(full_name, num)
where sr.full_name = x.full_name;
