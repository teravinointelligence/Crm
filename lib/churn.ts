// Detección de churn por cuenta — relativo a SU PROPIO patrón, no a un umbral
// fijo de días. Compara la facturación reciente contra la línea base del propio
// cliente (meses previos). Puro y testeable.
//
// Fuente: monthly_sales (account_id, period, venta_bruta). Como solo hay filas
// para meses CON facturación, rellenamos con 0 los meses sin venta dentro del
// rango global, para que "dejó de facturar" se detecte como caída a 0.

function fmt(n: number): string {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(n);
}

export const CHURN_PARAMS = {
  minMonths: 3, // historia mínima para evaluar patrón
  baselineMonths: 3, // meses de línea base antes del último
  dropCayo: 0.5, // caída ≥50% = churn
  dropRiesgo: 0.3, // caída ≥30% = en riesgo
  minBaseline: 1000, // línea base mínima (MXN) para que la caída sea material
} as const;

export type ChurnStatus = "sano" | "en_riesgo" | "cayo" | "sin_facturacion" | "sin_historial";

export const CHURN_LABEL: Record<ChurnStatus, string> = {
  sano: "Compra estable",
  en_riesgo: "Compra a la baja",
  cayo: "Caída fuerte",
  sin_facturacion: "Dejó de facturar",
  sin_historial: "Sin historial suficiente",
};

export const CHURN_RANK: Record<ChurnStatus, number> = {
  sin_facturacion: 0,
  cayo: 1,
  en_riesgo: 2,
  sano: 3,
  sin_historial: 4,
};

export type ChurnResult = {
  status: ChurnStatus;
  baseline: number;
  recent: number;
  dropPct: number; // 0..1 (fracción de caída); negativo = creció
  monthsActive: number;
  reason: string;
};

/**
 * @param series  facturación del cliente: [{ period 'YYYY-MM-DD', amount }]
 * @param allPeriods  todos los periodos globales (de monthly_sales), ordenados asc
 */
export function computeChurn(
  series: { period: string; amount: number }[],
  allPeriods: string[],
  params = CHURN_PARAMS,
): ChurnResult {
  const byPeriod = new Map(series.map((s) => [s.period.slice(0, 10), Number(s.amount) || 0]));
  const periods = [...allPeriods].sort();
  if (!periods.length) {
    return { status: "sin_historial", baseline: 0, recent: 0, dropPct: 0, monthsActive: 0, reason: "Sin periodos de venta." };
  }

  // Span activo: desde el primer mes con venta hasta el último periodo global.
  const firstActiveIdx = periods.findIndex((p) => (byPeriod.get(p) ?? 0) > 0);
  if (firstActiveIdx < 0) {
    return { status: "sin_historial", baseline: 0, recent: 0, dropPct: 0, monthsActive: 0, reason: "Sin facturación registrada." };
  }
  const span = periods.slice(firstActiveIdx); // rellena 0 en meses sin venta dentro del span
  const amounts = span.map((p) => byPeriod.get(p) ?? 0);
  const monthsActive = amounts.filter((a) => a > 0).length;

  if (span.length < params.minMonths) {
    return {
      status: "sin_historial",
      baseline: 0,
      recent: amounts[amounts.length - 1] ?? 0,
      dropPct: 0,
      monthsActive,
      reason: `Solo ${monthsActive} mes(es) con venta — historia insuficiente para evaluar el patrón.`,
    };
  }

  const recent = amounts[amounts.length - 1];
  const baseSlice = amounts.slice(Math.max(0, amounts.length - 1 - params.baselineMonths), amounts.length - 1);
  const baseline = baseSlice.length ? baseSlice.reduce((a, b) => a + b, 0) / baseSlice.length : 0;

  if (baseline < params.minBaseline) {
    return {
      status: "sin_historial",
      baseline,
      recent,
      dropPct: 0,
      monthsActive,
      reason: "Línea base muy baja para evaluar una caída material.",
    };
  }

  const dropPct = (baseline - recent) / baseline;
  const baseLabel = `~${fmt(baseline)}/mes`;

  let status: ChurnStatus;
  if (recent <= 0) status = "sin_facturacion";
  else if (dropPct >= params.dropCayo) status = "cayo";
  else if (dropPct >= params.dropRiesgo) status = "en_riesgo";
  else status = "sano";

  const reason =
    status === "sin_facturacion"
      ? `Facturaba ${baseLabel} y el último mes no registró venta.`
      : status === "sano"
        ? `Facturación estable (${baseLabel}, último mes ${fmt(recent)}).`
        : `Facturaba ${baseLabel}, último mes ${fmt(recent)} → ${Math.round(dropPct * 100)}% menos.`;

  return { status, baseline, recent, dropPct, monthsActive, reason };
}
