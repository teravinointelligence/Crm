-- Corrige el error de dedo "Suavignon" -> "Sauvignon" en los nombres de
-- producto. El typo hacía que los vinos no aparecieran al buscar "sauvignon"
-- (p. ej. el Gerard Bertrand An940 no salía en el listado del banco de
-- muestras al armar una capacitación).
--
-- El nombre está denormalizado en sample_bank_movements.product_name y
-- sample_request_items.product_name (bitácoras), así que se corrige también
-- ahí para que la búsqueda del banco y los historiales queden consistentes.
-- Las ventas de CONTPAQ cruzan por sku/codigo_contpaqi, no por nombre, así
-- que el cambio no afecta ese cruce.

update public.products
set name = replace(name, 'Suavignon', 'Sauvignon')
where name like '%Suavignon%';

update public.sample_bank_movements
set product_name = replace(product_name, 'Suavignon', 'Sauvignon')
where product_name like '%Suavignon%';

update public.sample_request_items
set product_name = replace(product_name, 'Suavignon', 'Sauvignon')
where product_name like '%Suavignon%';

-- Otros históricos con el nombre denormalizado (pedidos, OCs, resurtidos):
-- mismo criterio, para que las búsquedas por texto no pierdan renglones.
update public.order_items
set product_name = replace(product_name, 'Suavignon', 'Sauvignon')
where product_name like '%Suavignon%';

update public.purchase_order_items
set product_name = replace(product_name, 'Suavignon', 'Sauvignon')
where product_name like '%Suavignon%';

update public.restock_request_items
set product_name = replace(product_name, 'Suavignon', 'Sauvignon')
where product_name like '%Suavignon%';
