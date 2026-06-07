// Heurística determinista de conciliación (sin Claude).
// Dada una transacción (abono) y las facturas abiertas por cuenta, intenta:
//   1. identificar la cuenta por texto (nombre o # cliente en concepto/referencia),
//   2. cuadrar el monto: factura exacta, suma de varias, o pago parcial.
// Lo que no cuadra con confianza se delega a Claude desde el route handler.

import type { OpenInvoiceForMatch } from "@/lib/anthropic";
import type { ReconcileSuggestion } from "@/lib/bank/types";

export type AccountOpenInvoices = {
  account_id: string;
  account_name: string;
  client_number: string | null;
  invoices: OpenInvoiceForMatch[];
};

export type TxnForMatch = {
  date: string | null;
  description: string;
  reference: string | null;
  amount: number;
};

function norm(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

const STOP = new Set([
  "spei", "transferencia", "deposito", "pago", "factura", "abono", "cliente",
  "interbancaria", "recibido", "enviado", "del", "los", "las", "para", "por",
  "sa", "de", "cv", "sapi", "rfc", "ref", "referencia", "banco", "cuenta",
]);

/** Tokens significativos del concepto/referencia para buscar la cuenta. */
function tokens(txt: string): string[] {
  return norm(txt)
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !STOP.has(w));
}

function money(a: number, b: number): boolean {
  return Math.abs(a - b) <= 0.5; // tolerancia de centavos / redondeo
}

/** Puntúa qué tan bien una cuenta coincide con el texto del movimiento. */
function scoreAccount(acc: AccountOpenInvoices, txtTokens: string[], rawText: string): number {
  let score = 0;
  if (acc.client_number) {
    const cn = String(acc.client_number).replace(/^0+/, "");
    if (cn && new RegExp(`\\b0*${cn}\\b`).test(rawText)) score += 5;
  }
  const nameTokens = tokens(acc.account_name);
  for (const t of nameTokens) {
    if (txtTokens.includes(t)) score += 2;
  }
  return score;
}

/** Busca una combinación de facturas que sume `target` (exacta). Hasta 3 facturas. */
function findSubset(
  invoices: OpenInvoiceForMatch[],
  target: number,
): OpenInvoiceForMatch[] | null {
  // 1 factura exacta
  for (const i of invoices) if (money(i.balance, target)) return [i];
  // 2 facturas
  for (let a = 0; a < invoices.length; a++)
    for (let b = a + 1; b < invoices.length; b++)
      if (money(invoices[a].balance + invoices[b].balance, target)) return [invoices[a], invoices[b]];
  // 3 facturas
  for (let a = 0; a < invoices.length; a++)
    for (let b = a + 1; b < invoices.length; b++)
      for (let c = b + 1; c < invoices.length; c++)
        if (money(invoices[a].balance + invoices[b].balance + invoices[c].balance, target))
          return [invoices[a], invoices[b], invoices[c]];
  return null;
}

const NONE: ReconcileSuggestion = {
  source: "ninguna",
  confidence: "ninguna",
  reason: "Sin coincidencia automática.",
  account_id: null,
  account_name: null,
  candidates: [],
};

export type HeuristicResult = {
  suggestion: ReconcileSuggestion;
  /** Cuenta candidata para preguntarle a Claude si la heurística no cuadró el monto. */
  ambiguousAccount: AccountOpenInvoices | null;
};

export function heuristicMatch(
  txn: TxnForMatch,
  accounts: AccountOpenInvoices[],
): HeuristicResult {
  const rawText = norm(`${txn.description} ${txn.reference ?? ""}`);
  const txtTokens = tokens(`${txn.description} ${txn.reference ?? ""}`);

  // Ranking de cuentas por texto.
  const ranked = accounts
    .map((a) => ({ acc: a, score: scoreAccount(a, txtTokens, rawText) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);

  const toCandidates = (invs: OpenInvoiceForMatch[]) =>
    invs.map((i) => ({ invoice_id: i.invoice_id, invoice_number: i.invoice_number, amount: i.balance }));

  // Caso A: cuenta identificada por texto.
  if (ranked.length) {
    const top = ranked[0].acc;
    const subset = findSubset(top.invoices, txn.amount);
    if (subset) {
      return {
        suggestion: {
          source: "heuristica",
          confidence: ranked[0].score >= 5 ? "alta" : "media",
          reason:
            subset.length === 1
              ? `Monto exacto de la factura ${subset[0].invoice_number} y el cliente aparece en el concepto.`
              : `El abono cuadra con la suma de ${subset.length} facturas de ${top.account_name}.`,
          account_id: top.account_id,
          account_name: top.account_name,
          candidates: toCandidates(subset),
        },
        ambiguousAccount: null,
      };
    }
    // Hay cuenta pero el monto no cuadra → ambiguo (lo verá Claude).
    return {
      suggestion: {
        source: "ninguna",
        confidence: "baja",
        reason: `Cliente probable: ${top.account_name}, pero el monto no cuadra con una factura. Requiere revisión.`,
        account_id: top.account_id,
        account_name: top.account_name,
        candidates: [],
      },
      ambiguousAccount: top,
    };
  }

  // Caso B: sin cuenta por texto, pero el monto coincide exacto con UNA sola factura
  // en todo el universo → sugerencia de confianza media.
  const exactHits: { acc: AccountOpenInvoices; inv: OpenInvoiceForMatch }[] = [];
  for (const acc of accounts) {
    for (const inv of acc.invoices) {
      if (money(inv.balance, txn.amount)) exactHits.push({ acc, inv });
      if (exactHits.length > 1) break;
    }
    if (exactHits.length > 1) break;
  }
  if (exactHits.length === 1) {
    const { acc, inv } = exactHits[0];
    return {
      suggestion: {
        source: "heuristica",
        confidence: "media",
        reason: `Monto exacto de la factura ${inv.invoice_number} (${acc.account_name}), aunque el concepto no menciona al cliente.`,
        account_id: acc.account_id,
        account_name: acc.account_name,
        candidates: [{ invoice_id: inv.invoice_id, invoice_number: inv.invoice_number, amount: inv.balance }],
      },
      ambiguousAccount: null,
    };
  }

  return { suggestion: NONE, ambiguousAccount: null };
}
