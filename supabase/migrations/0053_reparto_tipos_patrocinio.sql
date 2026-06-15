-- =====================================================================
-- 0053 — Más tipos de pedido en Reparto: patrocinio y otro
-- =====================================================================
-- Además de facturas, traspasos (resurtidos de consignación) y
-- consignaciones nuevas, las rutas llevan patrocinios y otros documentos
-- sin factura. El PDF del documento se adjunta al pedido (pdf_url) vía
-- POST /api/reparto/pedidos/[id]/pdf.
-- =====================================================================

alter table reparto.pedidos drop constraint if exists pedidos_tipo_check;
alter table reparto.pedidos add constraint pedidos_tipo_check
  check (tipo in ('factura', 'traspaso', 'consignacion', 'patrocinio', 'otro'));
