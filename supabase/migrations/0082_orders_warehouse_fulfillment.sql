-- =====================================================================
-- Pedidos: almacén de salida + estado de surtido
-- =====================================================================
-- Un pedido necesita saber DE QUÉ ALMACÉN sale (para facturación y para
-- ubicar el inventario) y si ya fue SURTIDO o falta por surtir. El estado
-- de surtido es operativo y va APARTE del status de venta
-- (borrador/enviada/…/facturada): un pedido puede estar "facturada" y aún
-- "por_surtir", o al revés.
--
-- Decisiones (2026-06-19):
--   • warehouse obligatorio se valida en el formulario solo para PEDIDOS
--     (las cotizaciones no surten); en BD queda nullable.
--   • surtido es solo una marca de estado: NO descuenta inventario.
--   • marcan surtido admin + jefe_logistica (se hace cumplir en el endpoint).
-- =====================================================================

alter table public.orders
  add column if not exists warehouse text
    check (warehouse is null or warehouse in
      ('La Paz','V612','Tijuana','Vallarta','Los Cabos')),
  add column if not exists fulfillment_status text not null default 'por_surtir'
    check (fulfillment_status in ('por_surtir','surtido')),
  add column if not exists fulfilled_at timestamptz,
  add column if not exists fulfilled_by uuid references public.sales_reps(id);

-- Para el tablero de almacén: pedidos pendientes de surtir.
create index if not exists idx_orders_por_surtir
  on public.orders(fulfillment_status) where fulfillment_status = 'por_surtir';
