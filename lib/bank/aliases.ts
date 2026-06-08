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
