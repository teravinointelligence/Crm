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

/** Clave BNET del concepto (llave fuerte y estable del pagador). null si no hay. */
export function extractBnet(text: string): string | null {
  const m = /\bbnet\s*(\d{6,})/i.exec(text);
  return m ? m[1] : null;
}

/** RFC que aparezca en el concepto (persona moral 12 / física 13). null si no hay. */
export function extractRfc(text: string): string | null {
  const m = /\b([A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3})\b/i.exec(text);
  return m ? m[1].toUpperCase() : null;
}

export type PayerKey = { kind: "bnet" | "rfc" | "firma"; key: string };

/** Todas las llaves de identificación de un movimiento, en orden de confianza. */
export function payerKeys(description: string, reference?: string | null): PayerKey[] {
  const text = `${description} ${reference ?? ""}`;
  const keys: PayerKey[] = [];
  const bnet = extractBnet(text);
  if (bnet) keys.push({ kind: "bnet", key: bnet });
  const rfc = extractRfc(text);
  if (rfc) keys.push({ kind: "rfc", key: rfc });
  const firma = payerSignature(description, reference);
  if (firma) keys.push({ kind: "firma", key: firma });
  return keys;
}
