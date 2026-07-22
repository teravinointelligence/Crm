-- Fix: los vendedores no podían crear pedidos de restock.
--
-- Síntoma (logs de Postgres del 21-jul-2026, 4 veces seguidas):
--   duplicate key value violates unique constraint "restock_requests_request_number_key"
--
-- Causa: next_request_number() calcula el folio como max(...)+1 sobre
-- restock_requests, pero NO era security definer, así que corría con el RLS
-- del que la llama. La política restock_select solo deja ver los pedidos
-- propios (is_admin() or sales_rep_id = current_rep_id()), de modo que un
-- vendedor que nunca ha hecho un restock ve 0 renglones, el max da 0 y la
-- función devuelve REQ-2026-0001... que ya existe (es de otra persona). El
-- insert choca contra el índice único y el vendedor queda bloqueado: no puede
-- crear el pedido ni desde el formulario ni desde "convertir sugerencia".
--
-- Los demás folios no tienen el problema porque ya corren como definer:
-- create_order() (pedidos/cotizaciones) y tg_sample_set_number() (muestras).
-- next_request_number era la única que se llama por RPC directo desde el
-- cliente sin serlo.
--
-- Arreglo: security definer + search_path fijo, para que el folio se calcule
-- SIEMPRE contra la tabla completa, sin importar quién la llame. No cambia el
-- formato del folio ni ninguna regla de negocio.

create or replace function public.next_request_number()
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_year text; v_next int;
begin
  v_year := to_char(current_date, 'YYYY');
  select coalesce(max(substring(request_number from '\d+$')::int), 0) + 1
    into v_next
    from public.restock_requests
   where request_number like 'REQ-' || v_year || '-%';
  return 'REQ-' || v_year || '-' || lpad(v_next::text, 4, '0');
end;
$$;
