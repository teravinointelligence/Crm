export const LOS_CABOS_DRIVER_EMAILS = [
  "anibal@teravino.com",
  "gonzalo@teravino.com",
  "isai@teravino.com",
] as const;

// Al reservar desde el pool, el pedido ya está físicamente en manos del chofer.
// Marcarlo en ruta evita que otro chofer salga a entregar la misma factura.
export const SELF_CLAIM_STATUS = "en_ruta" as const;

export function normalizeDriverEmail(email: string | null | undefined): string {
  return (email ?? "").trim().toLowerCase();
}

export function isLosCabosDriver(email: string | null | undefined): boolean {
  return (LOS_CABOS_DRIVER_EMAILS as readonly string[]).includes(normalizeDriverEmail(email));
}

export function canSelfClaimLosCabos(
  email: string | null | undefined,
  availableEmails: readonly string[],
): boolean {
  const normalized = normalizeDriverEmail(email);
  return isLosCabosDriver(normalized) && availableEmails.map(normalizeDriverEmail).includes(normalized);
}
