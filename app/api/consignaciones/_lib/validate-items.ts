// Validación/normalización de los renglones de una consignación nueva.
// Función pura sin imports: la usa el POST /api/consignaciones y se prueba
// directo con `node --test` (type stripping), por eso no depende de lib/base44
// (que es server-only) ni de aliases @/.

export type LineaInput = {
  producto_id: string;
  producto_nombre: string;
  cantidad: unknown;
  precio_unitario: unknown;
};

export type LineaNormalizada = {
  producto_id: string;
  producto_nombre: string;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
};

export type BuildItemsResult =
  | { ok: true; items: LineaNormalizada[]; total: number }
  | { ok: false; error: string };

export const PRECIO_CERO_ERROR =
  "Cada producto debe tener un precio unitario mayor a $0.00";

/**
 * Valida cantidades y precios y construye los items con subtotal/total
 * calculados server-side. Rechaza cantidad ≤ 0, precio ≤ 0 (consignaciones
 * con total $0.00 son basura operativa) y totales que terminen en $0.00.
 */
export function buildConsignacionItems(lineas: LineaInput[]): BuildItemsResult {
  if (!Array.isArray(lineas) || lineas.length === 0) {
    return { ok: false, error: "Debe incluir al menos un item" };
  }

  const items: LineaNormalizada[] = [];
  for (const linea of lineas) {
    const cantidad = Number(linea.cantidad);
    if (!Number.isFinite(cantidad) || cantidad <= 0) {
      return { ok: false, error: `Cantidad inválida para producto ${linea.producto_nombre}` };
    }
    const precio = Number(linea.precio_unitario);
    if (!Number.isFinite(precio) || precio <= 0) {
      return {
        ok: false,
        error: `${PRECIO_CERO_ERROR} — revisa "${linea.producto_nombre}"`,
      };
    }
    items.push({
      producto_id: linea.producto_id,
      producto_nombre: linea.producto_nombre,
      cantidad,
      precio_unitario: precio,
      subtotal: Math.round(cantidad * precio * 100) / 100,
    });
  }

  const total = Math.round(items.reduce((s, i) => s + i.subtotal, 0) * 100) / 100;
  if (total <= 0) {
    return { ok: false, error: "El total de la consignación debe ser mayor a $0.00" };
  }

  return { ok: true, items, total };
}
