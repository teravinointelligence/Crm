type GroupWithEmail = {
  email: string | null;
};

/**
 * Limita los avisos al vendedor autenticado. Ante un correo ausente o sin
 * correspondencia, falla de forma segura y no expone pendientes del equipo.
 */
export function selectTomasGroupsForRep<T extends GroupWithEmail>(
  groups: T[],
  email: string | null | undefined,
  isAdmin: boolean,
): T[] {
  if (isAdmin) return groups;

  const normalizedEmail = email?.trim().toLowerCase();
  if (!normalizedEmail) return [];

  return groups.filter((group) => group.email?.trim().toLowerCase() === normalizedEmail);
}
