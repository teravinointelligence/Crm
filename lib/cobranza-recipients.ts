// Registro de EXCLUSIONES de destinatarios en los correos de cobranza.
//
// Reglas de negocio (registradas a pedido de dirección):
//   • Fideicomiso Pedregal: los correos de cobro van SOLO a Cuentas por Pagar.
//     No incluir a Jonathan ni a Jairo aunque tengan correo en la cuenta.
//
// El filtro se aplica en el ÚNICO punto donde se arma la lista de destinatarios
// (ver `cobranzaRecipients`), de modo que TODOS los canales respeten la misma
// regla: el recordatorio de estado de cuenta (`lib/cobranza-email.ts`) y la
// cobranza redactada por IA (`lib/cobranza-data.ts`, que además llena el
// selector "Para" en la UI).

/** Quita acentos y pasa a minúsculas para comparar sin fricción. */
function norm(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export type CobranzaContact = {
  full_name?: string | null;
  email: string | null;
};

export type RecipientExclusionRule = {
  /** La cuenta califica si su nombre fiscal o comercial contiene alguno de estos textos. */
  accountMatch: string[];
  /** Se excluye un contacto si su nombre o su correo contiene alguno de estos textos. */
  excludeContacts: string[];
  /** Nota de negocio para trazabilidad. */
  note: string;
};

export const COBRANZA_RECIPIENT_EXCLUSIONS: RecipientExclusionRule[] = [
  {
    accountMatch: ["pedregal"],
    excludeContacts: ["jonathan", "jairo"],
    note: "Fideicomiso Pedregal: la cobranza va solo a Cuentas por Pagar; no incluir a Jonathan ni a Jairo.",
  },
];

/** Reglas de exclusión que aplican a una cuenta según su nombre fiscal/comercial. */
export function exclusionRulesForAccount(
  accountNames: (string | null | undefined)[],
): RecipientExclusionRule[] {
  const names = accountNames.map(norm).filter(Boolean);
  if (!names.length) return [];
  return COBRANZA_RECIPIENT_EXCLUSIONS.filter((rule) =>
    rule.accountMatch.some((m) => {
      const needle = norm(m);
      return names.some((n) => n.includes(needle));
    }),
  );
}

/** true si el contacto debe excluirse de la cobranza dadas las reglas aplicables. */
export function isContactExcluded(
  contact: CobranzaContact,
  rules: RecipientExclusionRule[],
): boolean {
  if (!rules.length) return false;
  const name = norm(contact.full_name);
  const email = norm(contact.email);
  return rules.some((rule) =>
    rule.excludeContacts.some((term) => {
      const t = norm(term);
      if (!t) return false;
      return (!!name && name.includes(t)) || (!!email && email.includes(t));
    }),
  );
}

/**
 * Arma la lista final de correos de cobranza de una cuenta: aplica las
 * exclusiones registradas y deduplica (sin distinguir mayúsculas). Conserva el
 * orden de entrada (el contacto principal debe venir primero).
 */
export function cobranzaRecipients(
  account: { business_name?: string | null; fiscal_name?: string | null },
  contacts: CobranzaContact[],
): string[] {
  const rules = exclusionRulesForAccount([account.business_name, account.fiscal_name]);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of contacts) {
    const email = c.email?.trim();
    if (!email || !email.includes("@")) continue;
    if (isContactExcluded(c, rules)) continue;
    const key = email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(email);
  }
  return out;
}
