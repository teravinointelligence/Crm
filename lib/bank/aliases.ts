// Firma del "ordenante" de un depósito, para aprender ordenante → cliente.
//
// El concepto de un SPEI/depósito trae basura variable (folios, fechas, banco)
// y, a veces, un token distintivo del pagador (su nombre o su clave). La firma
// se queda SOLO con tokens alfabéticos distintivos: quita dígitos, banco,
// palabras genéricas y "teravino" (el receptor). Si no queda nada distintivo,
// la firma es vacía y NO se aprende alias (conservador: preferimos no aprender
// a aprender mal). Aun así, el RPC marca como ambiguo cualquier firma que
// termine apuntando a >1 cliente, y deja de sugerirla.

const BANKS = new Set([
  "banorte", "santander", "bbva", "banamex", "citibanamex", "hsbc", "scotiabank",
  "banbajio", "bajio", "afirme", "inbursa", "banregio", "mifel", "azteca",
  "bancoppel", "actinver", "intercam", "monex", "banxico", "bancomext",
  "multiva", "compartamos", "invex", "stp",
]);

const STOP = new Set([
  "spei", "transferencia", "deposito", "pago", "factura", "facturas", "abono",
  "cliente", "interbancaria", "recibido", "enviado", "para", "por", "sapi",
  "rfc", "ref", "referencia", "banco", "cuenta", "tercero", "compensacion",
  "mora", "norma", "bnet", "bmrcash", "cash", "operativa", "mxn", "teravino",
  "traspaso", "credito", "deposito", "pagos",
]);

function norm(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Firma normalizada del pagador. Vacía si no hay tokens distintivos. */
export function payerSignature(description: string, reference?: string | null): string {
  const text = norm(`${description} ${reference ?? ""}`)
    .replace(/\d+/g, " ") // fuera folios/fechas
    .replace(/[^a-z\s]/g, " ");
  const toks = text
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !STOP.has(w) && !BANKS.has(w));
  return Array.from(new Set(toks)).sort().join(" ");
}

/**
 * Clave BNET del concepto (llave fuerte y estable del pagador BBVA → BBVA,
 * "PAGO CUENTA DE TERCERO ... BNET nnnnnnnnnn"). null si no hay. Para SPEI
 * interbancario la llave equivalente es la CLABE ordenante: ver extractClabe.
 */
export function extractBnet(text: string): string | null {
  const m = /\bbnet\s*(\d{6,})/i.exec(text);
  return m ? m[1] : null;
}

/** RFC que aparezca en el concepto (persona moral 12 / física 13). null si no hay. */
export function extractRfc(text: string): string | null {
  const m = /\b([A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3})\b/i.exec(text);
  return m ? m[1].toUpperCase() : null;
}

// ---- CLABE (cuenta ordenante de SPEI interbancario) ----------------------
//
// En un "SPEI RECIBIDO <BANCO>" BBVA imprime la cuenta ordenante como una línea
// de 18 dígitos (CLABE: 3 banco + 3 plaza + 11 cuenta + 1 verificador) o de 20
// (la misma CLABE con "00" al frente). Es una llave tan fuerte como el BNET,
// pero de OTRO banco: la guardamos como kind 'clabe', canónica a 18 dígitos.

/** Dígito verificador oficial de CLABE (pesos 3,7,1 sobre los primeros 17). */
export function isValidClabe(digits: string): boolean {
  if (!/^\d{18}$/.test(digits)) return false;
  const W = [3, 7, 1];
  let sum = 0;
  for (let i = 0; i < 17; i++) sum += (Number(digits[i]) * W[i % 3]) % 10;
  return (10 - (sum % 10)) % 10 === Number(digits[17]);
}

/**
 * Normaliza una CLABE a su forma canónica de 18 dígitos: quita todo lo que no
 * sea dígito y el relleno "00" de la versión a 20 dígitos del estado de cuenta.
 * Devuelve null si no queda una CLABE válida (largo o dígito verificador).
 */
export function normalizeClabe(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let d = String(raw).replace(/\D/g, "");
  if (d.length === 20 && d.startsWith("00")) d = d.slice(2);
  return isValidClabe(d) ? d : null;
}

/**
 * CLABE ordenante del concepto (18 o 20 dígitos seguidos, no parte de una
 * cadena más larga). Se valida el dígito verificador para no confundir folios
 * o claves de rastreo largas con una cuenta. null si no hay.
 */
export function extractClabe(text: string): string | null {
  const re = /(?<!\d)(\d{18}|\d{20})(?!\d)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const c = normalizeClabe(m[1]);
    if (c) return c;
  }
  return null;
}

export type PayerKeyKind = "bnet" | "clabe" | "rfc" | "firma";
export type PayerKey = { kind: PayerKeyKind; key: string };

/** Todas las llaves de identificación de un movimiento, en orden de confianza. */
export function payerKeys(description: string, reference?: string | null): PayerKey[] {
  const text = `${description} ${reference ?? ""}`;
  const keys: PayerKey[] = [];
  const bnet = extractBnet(text);
  if (bnet) keys.push({ kind: "bnet", key: bnet });
  const clabe = extractClabe(text);
  if (clabe) keys.push({ kind: "clabe", key: clabe });
  const rfc = extractRfc(text);
  if (rfc) keys.push({ kind: "rfc", key: rfc });
  const firma = payerSignature(description, reference);
  if (firma) keys.push({ kind: "firma", key: firma });
  return keys;
}
