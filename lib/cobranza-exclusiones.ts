// Exclusiones de destinatarios en los correos de cobro (estado de cuenta y
// cobranza inteligente). Aunque un contacto esté registrado en la cuenta, si
// coincide con una regla de esta lista NO se le incluye ni se le copia en el
// correo de cobranza.
//
// Caso vigente: en la cuenta "Pedregal Fideicomiso" no se copia a Jonathan ni
// a Jairo en los recordatorios de cobranza. El filtro compara por cuenta +
// nombre (o correo), normalizando mayúsculas y acentos.

/** Normaliza para comparar: minúsculas, sin acentos, sin espacios extra. */
function norm(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

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
 * `cuenta` puede traer el nombre fiscal, el comercial o ambos concatenados;
 * la regla aplica si el nombre de la cuenta contiene el fragmento configurado.
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
