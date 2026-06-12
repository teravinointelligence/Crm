-- =====================================================================
-- 0052 — Tipo de pedido en Reparto: factura / traspaso / consignación
-- =====================================================================
-- Las rutas no solo llevan facturas: también resurtidos de consignación
-- (se tramitan como "traspaso de almacén" al almacén de consignación del
-- cliente) y consignaciones nuevas. Se agrega reparto.pedidos.tipo para
-- distinguirlos; numero_factura pasa a ser el folio/referencia del
-- documento que corresponda.
-- =====================================================================

alter table reparto.pedidos
  add column if not exists tipo text not null default 'factura'
  check (tipo in ('factura', 'traspaso', 'consignacion'));

-- Backfill: los resurtidos de consignación ya creados (folio RESURT-…,
-- generados por /api/consignaciones/[id]/reposicion) son traspasos.
update reparto.pedidos set tipo = 'traspaso' where numero_factura like 'RESURT-%';
