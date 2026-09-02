export type RestockVerdict = "justificado" | "reducir" | "no_recomendado" | "datos_insuficientes";

export function inventoryAgeDays(inventoryDate: string | null, now = new Date()) {
  if (!inventoryDate) return null;
  const timestamp = new Date(`${inventoryDate}T00:00:00Z`).getTime();
  if (!Number.isFinite(timestamp)) return null;
  return Math.max(0, Math.floor((now.getTime() - timestamp) / 86_400_000));
}

export function classifyRestock(input: {
  requested: number;
  salesPerMonth: number;
  suggestedQty: number;
}): { verdict: Exclude<RestockVerdict, "datos_insuficientes">; reason: string } {
  if (input.salesPerMonth <= 0) return {
    verdict: "no_recomendado",
    reason: "No hay ventas recientes que justifiquen aumentar el inventario.",
  };
  if (input.suggestedQty <= 0) return {
    verdict: "no_recomendado",
    reason: "El inventario actual cubre la demanda y no requiere reabasto.",
  };
  if (input.requested > input.suggestedQty) return {
    verdict: "reducir",
    reason: `Posible sobrestock: se piden ${input.requested}, pero el modelo sugiere maximo ${input.suggestedQty}.`,
  };
  return {
    verdict: "justificado",
    reason: `La cantidad esta dentro del reabasto sugerido (${input.suggestedQty}).`,
  };
}
