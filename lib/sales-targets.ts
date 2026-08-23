export const SALES_TARGET_STRETCH = 1.15;
export const SALES_TARGET_ROUNDING = 25_000;

export type SalesTargetStatus = "projection" | "locked" | "overridden";
export type SalesTargetBasis =
  | "floor"
  | "recent_average"
  | "seasonality"
  | "direction_override";

export type SalesTargetCalculation = {
  target: number;
  minimumFloor: number;
  recentAverage: number;
  priorYearSales: number;
  ytdFactor: number;
  recentStretch: number;
  seasonalStretch: number;
  selectedBasis: Exclude<SalesTargetBasis, "direction_override">;
};

function positive(value: number): number {
  return Math.max(0, Number(value) || 0);
}

export function roundSalesTarget(value: number): number {
  const amount = positive(value);
  return amount ? Math.ceil(amount / SALES_TARGET_ROUNDING) * SALES_TARGET_ROUNDING : 0;
}

export function calculateSeasonalSalesTarget(params: {
  minimumFloor: number;
  recentClosedSales: number[];
  priorYearSales: number;
  currentYtdSales: number;
  priorYtdSales: number;
}): SalesTargetCalculation {
  const minimumFloor = positive(params.minimumFloor);
  const recent = params.recentClosedSales.map(positive).slice(-3);
  const recentAverage = recent.length
    ? recent.reduce((total, amount) => total + amount, 0) / recent.length
    : 0;
  const priorYearSales = positive(params.priorYearSales);
  const priorYtdSales = positive(params.priorYtdSales);
  const ytdFactor = priorYtdSales
    ? positive(params.currentYtdSales) / priorYtdSales
    : 1;
  const recentStretch = recentAverage * SALES_TARGET_STRETCH;
  const seasonalStretch = priorYearSales * ytdFactor * SALES_TARGET_STRETCH;
  const candidates = [
    { basis: "floor" as const, amount: minimumFloor },
    { basis: "recent_average" as const, amount: recentStretch },
    { basis: "seasonality" as const, amount: seasonalStretch },
  ];
  const selected = candidates.reduce((best, candidate) =>
    candidate.amount > best.amount ? candidate : best,
  );

  return {
    target: roundSalesTarget(selected.amount),
    minimumFloor,
    recentAverage,
    priorYearSales,
    ytdFactor,
    recentStretch,
    seasonalStretch,
    selectedBasis: selected.basis,
  };
}

export function salesTargetStatusLabel(status: SalesTargetStatus | null): string {
  if (status === "locked") return "Meta bloqueada";
  if (status === "overridden") return "Ajustada por Dirección";
  return "Proyección dinámica";
}
