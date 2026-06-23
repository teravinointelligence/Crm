-- Reemplazo atómico del detalle de partidas al importar ventas CONTPAQ.
--
-- Bug que corrige: el importador (confirmContpaq) hacía DELETE de las partidas
-- de todas las cabeceras del import y luego INSERT por lotes desde el cliente.
-- Al no ser atómico, si un lote fallaba (fila mala, overflow, etc.) hacía return
-- y dejaba el detalle borrado: la cuenta quedaba con cabecera y totales correctos
-- pero CERO partidas. Como re-importar el mismo mes es habitual, bastaba un error
-- para vaciar el detalle de varias cuentas (p. ej. 47 cuentas en may-2026).
--
-- Esta función hace delete + insert en una sola transacción: si el insert falla,
-- el delete se revierte y se conserva el detalle previo (sin pérdida de datos).
-- SECURITY INVOKER: respeta el RLS del usuario que llama (igual que el delete/
-- insert directos que reemplaza).

create or replace function public.replace_sales_items(
  p_sale_ids uuid[],
  p_items jsonb
)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_inserted integer := 0;
begin
  -- Borra el detalle previo de las cabeceras tocadas en este import.
  if p_sale_ids is not null and array_length(p_sale_ids, 1) is not null then
    delete from monthly_sales_items where monthly_sale_id = any(p_sale_ids);
  end if;

  -- Inserta el detalle nuevo (si lo hay) desde el arreglo JSON.
  if p_items is not null and jsonb_array_length(p_items) > 0 then
    insert into monthly_sales_items (
      monthly_sale_id, codigo, producto_nombre, cantidad,
      neto, descuento, neto_desc, impuesto, total
    )
    select
      (e->>'monthly_sale_id')::uuid,
      nullif(e->>'codigo', ''),
      e->>'producto_nombre',
      coalesce((e->>'cantidad')::numeric, 0),
      coalesce((e->>'neto')::numeric, 0),
      coalesce((e->>'descuento')::numeric, 0),
      coalesce((e->>'neto_desc')::numeric, 0),
      coalesce((e->>'impuesto')::numeric, 0),
      coalesce((e->>'total')::numeric, 0)
    from jsonb_array_elements(p_items) e;
    get diagnostics v_inserted = row_count;
  end if;

  return v_inserted;
end;
$$;

comment on function public.replace_sales_items(uuid[], jsonb) is
  'Reemplaza atómicamente (delete+insert en una transacción) el detalle de partidas de las cabeceras monthly_sales indicadas. Evita dejar cabeceras sin partidas si el insert falla a medias.';
