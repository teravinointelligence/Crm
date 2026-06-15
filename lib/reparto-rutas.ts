// Helpers puros de la vista Reparto › Rutas (tablero kanban).
// Sin imports a propósito: se prueban directo con `node --test`
// (tests/reparto-rutas.test.mjs).

/** Estatus que cuentan como "pendiente de entrega" para arrastrar rezagados. */
export const ESTATUS_PENDIENTES = ["pendiente_asignar", "asignado", "en_ruta"] as const;

/**
 * Un pedido es rezagado si su fecha de factura es anterior a la fecha de
 * operación del tablero. Fechas en formato AAAA-MM-DD (comparación lexicográfica
 * segura, sin objetos Date ni zonas horarias).
 */
export function esRezagado(pedido: { fecha: string }, fechaOperacion: string): boolean {
  return Boolean(pedido.fecha) && Boolean(fechaOperacion) && pedido.fecha < fechaOperacion;
}

/**
 * Combina los pedidos del día con los rezagados de días anteriores, sin
 * duplicar ids (si un pedido viniera en ambas listas, gana el del día).
 * Los rezagados van primero: son lo urgente que el tablero debe destacar.
 */
export function combinarConRezagados<T extends { id: string }>(
  delDia: T[],
  rezagados: T[],
): T[] {
  const idsDelDia = new Set(delDia.map((p) => p.id));
  return [...rezagados.filter((p) => !idsDelDia.has(p.id)), ...delDia];
}

/** URL canónica del tablero: la URL es la única fuente de verdad de fecha y toggle. */
export function buildRutasUrl(fecha: string, incluirRezagados: boolean): string {
  const sp = new URLSearchParams();
  if (fecha) sp.set("fecha", fecha);
  if (incluirRezagados) sp.set("rezagados", "1");
  const qs = sp.toString();
  return qs ? `/reparto/rutas?${qs}` : "/reparto/rutas";
}
