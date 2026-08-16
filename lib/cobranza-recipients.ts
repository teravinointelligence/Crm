// Quién recibe los correos de cobro de una cuenta, a partir de sus contactos.
//
// Regla de selección:
//   1. Si la cuenta tiene contactos marcados como "recibe cobros"
//      (cobranza_recipient = true), se envía SOLO a esos (el área
//      administrativa de la cuenta).
//   2. Si NINGÚN contacto está marcado, se cae al comportamiento previo:
//      todos los contactos con correo (transición segura, no corta cobros).
//   3. En ambos casos se aplican las EXCLUSIONES (p. ej. Jonathan/Jairo en
//      Pedregal) y se deduplica sin distinguir mayúsculas.
//
// Este módulo no importa otros módulos locales a propósito: así puede probarse
// de forma aislada con el runner de tests.

/** Normaliza para comparar: minúsculas, sin acentos, sin espacios extra. */
function norm(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

// --- Exclusiones -----------------------------------------------------------
// Aunque un contacto esté registrado (o incluso marcado como "recibe cobros"),
// si coincide con una regla de esta lista NO se le incluye ni se le copia.

export type CobranzaExclusion = {
  /**
   * Nombre (o palabras clave) de la cuenta a la que aplica. La regla aplica si
   * TODAS las palabras aquí aparecen en el nombre de la cuenta, en cualquier
   * orden — así "pedregal fideicomiso" también cubre "Fideicomiso Pedregal S.A.".
   */
  cuenta: string;
  /** Fragmentos de nombre de contacto a excluir (coincidencia por "incluye"). */
  nombres?: string[];
  /** Correos exactos a excluir. */
  correos?: string[];
};

export const COBRANZA_EXCLUSIONES: CobranzaExclusion[] = [
  // Pedregal Fideicomiso: no copiar a Jonathan ni a Jairo en los correos de cobro.
  { cuenta: "pedregal fideicomiso", nombres: ["jonathan", "jairo"] },
];

/**
 * True si el contacto debe EXCLUIRSE de los correos de cobro de la cuenta.
 * `cuenta` puede traer el nombre fiscal, el comercial o ambos concatenados.
 */
export function excluirDeCobranza(
  cuenta: string | null | undefined,
  contacto: { full_name?: string | null; email?: string | null },
): boolean {
  const cta = norm(cuenta);
  const nombre = norm(contacto.full_name);
  const correo = norm(contacto.email);
  for (const regla of COBRANZA_EXCLUSIONES) {
    // La cuenta coincide si todas las palabras de la regla están presentes,
    // sin importar el orden ("pedregal fideicomiso" == "fideicomiso pedregal").
    const palabras = norm(regla.cuenta).split(/\s+/).filter(Boolean);
    if (!palabras.every((p) => cta.includes(p))) continue;
    if (correo && regla.correos?.some((c) => norm(c) === correo)) return true;
    if (nombre && regla.nombres?.some((n) => nombre.includes(norm(n)))) return true;
  }
  return false;
}

// --- Selección de destinatarios -------------------------------------------

export type CobranzaContact = {
  full_name?: string | null;
  email?: string | null;
  cobranza_recipient?: boolean | null;
};

/**
 * Lista final de correos a los que enviar el cobro. `contacts` debe venir ya
 * ordenado como se quiera priorizar (p. ej. contacto principal primero); se
 * preserva ese orden.
 */
export function pickCobranzaEmails(
  cuenta: string | null | undefined,
  contacts: CobranzaContact[],
): string[] {
  const marcados = contacts.filter((c) => c.cobranza_recipient);
  const fuente = marcados.length ? marcados : contacts;

  const seen = new Set<string>();
  const emails: string[] = [];
  for (const c of fuente) {
    const email = c.email?.trim();
    if (!email || !email.includes("@")) continue;
    if (excluirDeCobranza(cuenta, c)) continue;
    const key = email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    emails.push(email);
  }
  return emails;
}
