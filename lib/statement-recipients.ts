export type StatementRecipientContact = {
  email: string | null;
  receives_statement: boolean | null;
};

/**
 * Devuelve únicamente los correos elegidos para recibir estados de cuenta.
 * Conserva el orden de entrada (el contacto principal llega primero desde BD)
 * y elimina duplicados sin distinguir mayúsculas.
 */
export function statementRecipientEmails(
  contacts: StatementRecipientContact[],
): string[] {
  const seen = new Set<string>();
  const recipients: string[] = [];

  for (const contact of contacts) {
    if (!contact.receives_statement) continue;
    const email = contact.email?.trim();
    if (!email || !email.includes("@")) continue;
    const key = email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    recipients.push(email);
  }

  return recipients;
}
