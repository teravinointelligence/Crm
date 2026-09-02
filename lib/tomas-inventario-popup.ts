type GroupWithEmail = {
  email: string | null;
};

type PendingClient = {
  cliente: string;
  clienteNumero: string | null;
};

type CrmAccount = {
  id: string;
  business_name: string;
  client_number: string | null;
};

function normalizeClientNumber(value: string | null): string {
  return value?.trim().replace(/^0+/, "") || "";
}

function normalizeName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Cruza Base44 con el CRM por número de cliente y, como respaldo seguro,
 * por nombre exacto normalizado únicamente cuando la coincidencia es única. */
export function resolveCrmAccountId(
  item: PendingClient,
  accounts: CrmAccount[],
): string | null {
  const clientNumber = normalizeClientNumber(item.clienteNumero);
  if (clientNumber) {
    const byNumber = accounts.filter(
      (account) => normalizeClientNumber(account.client_number) === clientNumber,
    );
    if (byNumber.length === 1) return byNumber[0].id;
  }

  const name = normalizeName(item.cliente);
  if (!name) return null;
  const byName = accounts.filter((account) => normalizeName(account.business_name) === name);
  return byName.length === 1 ? byName[0].id : null;
}

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
