export const LOS_CABOS_DRIVER_EMAILS = [
  "anibal@teravino.com",
  "gonzalo@teravino.com",
  "isai@teravino.com",
] as const;

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
