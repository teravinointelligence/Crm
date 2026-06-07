// Buckets de antigüedad de cartera (Flujo 3 — estado de cuenta).
// Buckets REALES de Sabrina: 1-31 / 32-62 / 63-93 / 94+ (no 0-30/31-60/...).
// El primer bucket absorbe lo no vencido/reciente para que los buckets
// siempre sumen el saldo total (necesario para el % del saldo).

export type BucketKey = "b_1_31" | "b_32_62" | "b_63_93" | "b_94_mas";

export const BUCKET_KEYS: BucketKey[] = ["b_1_31", "b_32_62", "b_63_93", "b_94_mas"];

export const BUCKET_LABEL: Record<BucketKey, string> = {
  b_1_31: "1–31 días",
  b_32_62: "32–62 días",
  b_63_93: "63–93 días",
  b_94_mas: "94+ días",
};

/** Bucket al que cae un # de días vencidos. <=31 → primer bucket. */
export function bucketDeDias(dias: number): BucketKey {
  if (dias <= 31) return "b_1_31";
  if (dias <= 62) return "b_32_62";
  if (dias <= 93) return "b_63_93";
  return "b_94_mas";
}

export type AgingBuckets = {
  b_1_31: number;
  b_32_62: number;
  b_63_93: number;
  b_94_mas: number;
  saldo_total: number;
};

/** % del saldo total que representa un bucket (0 si no hay saldo). */
export function pctDelSaldo(valor: number, total: number): number {
  if (!total || total <= 0) return 0;
  return (valor / total) * 100;
}

/** Días vencidos de una factura = corte - (emisión + días de crédito). Regla 11.
 *  null si no hay fecha de emisión. Negativo/0 = aún no vencida. */
export function diasVencidos(
  invoiceDate: string | null,
  creditDays: number,
  corte: Date,
): number | null {
  if (!invoiceDate) return null;
  const venc = new Date(invoiceDate);
  venc.setDate(venc.getDate() + creditDays);
  return Math.floor((corte.getTime() - venc.getTime()) / 86400000);
}

/** Resumen de vencimiento credit-aware sobre las facturas abiertas:
 *  saldo vencido total y el máximo de días vencidos (alimenta semáforo + riesgo). */
export function resumenVencido(
  invoices: { invoice_date: string | null; balance: number | null }[],
  creditDays: number,
  corte: Date,
): { saldoVencido: number; maxDiasVencido: number } {
  let saldoVencido = 0;
  let maxDiasVencido = 0;
  for (const i of invoices) {
    const bal = Number(i.balance ?? 0);
    if (bal <= 0) continue;
    const dv = diasVencidos(i.invoice_date, creditDays, corte);
    if (dv != null && dv > 0) {
      saldoVencido += bal;
      if (dv > maxDiasVencido) maxDiasVencido = dv;
    }
  }
  return { saldoVencido, maxDiasVencido };
}
