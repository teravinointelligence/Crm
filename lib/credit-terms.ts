export const CREDIT_TERM_STEPS = [60, 45, 30, 15, 0] as const;

/**
 * Devuelve el siguiente plazo estándar inferior. Los acuerdos especiales se
 * alinean al siguiente peldaño (90 -> 60, 28 -> 15, 7 -> contado).
 */
export function nextCreditDays(
  currentDays: number | null | undefined,
): number | null {
  if (currentDays == null || !Number.isFinite(currentDays)) return null;
  const normalized = Math.max(0, Math.round(currentDays));
  return CREDIT_TERM_STEPS.find((step) => step < normalized) ?? 0;
}

export function creditDaysLabel(days: number | null | undefined): string {
  if (days == null) return "Por confirmar";
  if (days <= 0) return "Contado";
  return `${days} días`;
}
