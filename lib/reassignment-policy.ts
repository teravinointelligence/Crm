/** Regla de negocio para recuperar cuentas sin seguimiento. */

/** Sabrina funciona como el pool general del CRM. */
export const SABRINA_POOL_REP_ID = "00000000-0000-4000-a000-000000000099";
/** El vendedor recibe un aviso siete días antes de perder la cuenta. */
export const REASSIGN_WARN_DAYS = 53;
/** Al cumplir este número de días sin actividad, la cuenta pasa a Sabrina. */
export const REASSIGN_AFTER_DAYS = 60;
export const REASSIGN_NOTICE_DAYS = REASSIGN_AFTER_DAYS - REASSIGN_WARN_DAYS;

export type ReassignmentAction = "ignore" | "recover" | "warn" | "pending" | "reassign";

export function decideReassignment(input: {
  assignedRepId: string | null;
  daysInactive: number;
  daysSinceWarning: number | null;
  activitySinceWarning: boolean;
}): { action: ReassignmentAction; daysRemaining: number } {
  const hasWarning = input.daysSinceWarning != null;
  const daysRemaining = hasWarning
    ? Math.max(
        0,
        REASSIGN_AFTER_DAYS - input.daysInactive,
        REASSIGN_NOTICE_DAYS - (input.daysSinceWarning ?? 0),
      )
    : REASSIGN_NOTICE_DAYS;

  // Las cuentas sin vendedor y las que ya están en el pool no vuelven a entrar
  // al ciclo ni generan avisos para Sabrina.
  if (!input.assignedRepId || input.assignedRepId === SABRINA_POOL_REP_ID) {
    return { action: "ignore", daysRemaining };
  }

  if (input.activitySinceWarning || input.daysInactive < REASSIGN_WARN_DAYS) {
    return { action: hasWarning ? "recover" : "ignore", daysRemaining };
  }

  // Nunca se quita una cuenta sin haber dado siete días completos desde el
  // aviso. Normalmente se avisa al día 53 y ambos límites vencen el día 60; si
  // el primer aviso sale tarde, esos siete días funcionan como última gracia.
  if (
    hasWarning &&
    input.daysInactive >= REASSIGN_AFTER_DAYS &&
    (input.daysSinceWarning ?? 0) >= REASSIGN_NOTICE_DAYS
  ) {
    return { action: "reassign", daysRemaining: 0 };
  }

  return { action: hasWarning ? "pending" : "warn", daysRemaining };
}
