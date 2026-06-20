-- =====================================================================
-- Rollup automático: inventario por almacén → stock principal
-- =====================================================================
-- Hasta ahora la importación "por almacén" escribía en
-- product_warehouse_stock pero NO tocaba products.stock_quantity, así que
-- el catálogo encabezaba con 0 (o un número viejo) aunque las bodegas
-- tuvieran existencias reales. Esto obligaba a re-sincronizar a mano.
--
-- Con este trigger, cada vez que cambia el inventario por almacén de un
-- producto (alta/cambio/baja de cualquier renglón), su stock_quantity se
-- recalcula como la SUMA de sus almacenes. Queda el inventario por almacén
-- como única fuente de verdad del stock principal.
--
-- Notas:
--   • Si se borran todos los renglones de un producto, su stock queda en 0.
--   • Productos SIN renglones de almacén (p. ej. cargados solo por el Excel
--     general) no se ven afectados: el trigger solo dispara con cambios en
--     product_warehouse_stock.
-- =====================================================================

create or replace function public.tg_warehouse_stock_rollup()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_product uuid := coalesce(new.product_id, old.product_id);
begin
  update public.products p
  set stock_quantity = coalesce((
        select sum(s.stock_quantity)
        from public.product_warehouse_stock s
        where s.product_id = v_product
      ), 0),
      last_stock_update = now(),
      last_stock_source = 'Rollup inventario por almacén'
  where p.id = v_product;
  return null;  -- AFTER trigger: el valor de retorno se ignora
end;
$$;

drop trigger if exists trg_warehouse_stock_rollup on public.product_warehouse_stock;
create trigger trg_warehouse_stock_rollup
  after insert or update or delete on public.product_warehouse_stock
  for each row execute function public.tg_warehouse_stock_rollup();
