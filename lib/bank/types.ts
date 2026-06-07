// Tipos compartidos del módulo de conciliación bancaria.

export type BankTxnKind = "abono" | "cargo";

/** Una transacción parseada de un estado de cuenta (antes de guardar). */
export type BankTxnParsed = {
  txn_date: string | null; // ISO yyyy-mm-dd
  description: string;
  reference: string | null;
  amount: number; // SIEMPRE positivo; el signo lo da `kind`
  kind: BankTxnKind;
  row_index: number;
};

export type BankParseResult = {
  rows: BankTxnParsed[];
  errors: { row: number; message: string }[];
  /** Cómo se obtuvo: parseo local de tabla o extracción de PDF con Claude. */
  source: "table" | "pdf";
};

/** Sugerencia de conciliación para un abono (heurística o Claude). */
export type ReconcileSuggestion = {
  source: "heuristica" | "claude" | "ninguna";
  confidence: "alta" | "media" | "baja" | "ninguna";
  reason: string;
  account_id: string | null;
  account_name: string | null;
  // Facturas propuestas para aplicar el abono.
  candidates: { invoice_id: string; invoice_number: string; amount: number }[];
};

export const ESTADO_CONCILIACION_LABELS: Record<string, string> = {
  sin_conciliar: "Sin conciliar",
  sugerido: "Sugerido",
  conciliado: "Conciliado",
  ignorado: "Ignorado",
};
