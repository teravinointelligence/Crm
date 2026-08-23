export const FELIX_INCENTIVE_EMAIL = "felix@teravino.com";
export const FELIX_INCENTIVE_START = "2026-09-01";
export const FELIX_INCENTIVE_END = "2027-08-31";
export const FELIX_INCENTIVE_MINIMUM = 400_000;
export const FELIX_INCENTIVE_HEALTHY = 450_000;
export const FELIX_INCENTIVE_MAX_OPENINGS = 2;

export type FelixIncentiveStatus = "upcoming" | "active" | "ended";

export type FelixOpening = {
  accountId: string;
  accountName: string;
  firstPurchaseDate: string;
  repeatPurchaseDate: string | null;
};

export type FelixIncentiveMonth = {
  period: string;
  netSales: number;
  ordinaryCommission: number;
  accelerator: number;
  openings: FelixOpening[];
  openingMilestones: number;
  openingBonusPotential: number;
  openingBonus: number;
  additionalIncentive: number;
  totalVariable: number;
  progressMinimum: number;
  progressHealthy: number;
  amountToMinimum: number;
  lastUpdatedAt: string | null;
};

export type FelixIncentiveSnapshot = {
  status: FelixIncentiveStatus;
  todayKey: string;
  currentPeriod: string;
  daysUntilStart: number;
  current: FelixIncentiveMonth;
  months: FelixIncentiveMonth[];
  dataWarning: string | null;
};

type SnapshotInput = {
  todayKey: string;
  salesByPeriod?: Record<string, number>;
  openingsByPeriod?: Record<string, FelixOpening[]>;
  updatedAtByPeriod?: Record<string, string | null>;
  dataWarning?: string | null;
};

export function isFelixIncentiveUser(email: string | null | undefined): boolean {
  return String(email ?? "").trim().toLowerCase() === FELIX_INCENTIVE_EMAIL;
}

export function calculateFelixAccelerator(netSales: number): number {
  const sales = Math.max(0, Number(netSales) || 0);
  const first = Math.max(0, Math.min(sales, 400_000) - 350_000) * 0.01;
  const second = Math.max(0, Math.min(sales, 500_000) - 400_000) * 0.02;
  const third = Math.max(0, sales - 500_000) * 0.03;
  return first + second + third;
}

export function calculateOpeningBonus(
  netSales: number,
  openings: FelixOpening[],
): { milestones: number; potential: number; unlocked: number } {
  const eligible = openings.slice(0, FELIX_INCENTIVE_MAX_OPENINGS);
  const milestones = eligible.reduce(
    (total, opening) => total + 1 + (opening.repeatPurchaseDate ? 1 : 0),
    0,
  );
  const potential = milestones * 1_000;
  return {
    milestones,
    potential,
    unlocked: netSales >= FELIX_INCENTIVE_MINIMUM ? potential : 0,
  };
}

function monthStart(dateKey: string): string {
  return `${dateKey.slice(0, 7)}-01`;
}

function addMonth(period: string): string {
  const year = Number(period.slice(0, 4));
  const month = Number(period.slice(5, 7));
  const d = new Date(Date.UTC(year, month, 1));
  return d.toISOString().slice(0, 10);
}

function listPeriods(from: string, to: string): string[] {
  const periods: string[] = [];
  for (let period = from; period <= to; period = addMonth(period)) periods.push(period);
  return periods;
}

function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T12:00:00Z`);
  const b = Date.parse(`${to}T12:00:00Z`);
  return Math.max(0, Math.ceil((b - a) / 86_400_000));
}

function buildMonth(
  period: string,
  netSales: number,
  openings: FelixOpening[],
  lastUpdatedAt: string | null,
): FelixIncentiveMonth {
  const sales = Math.max(0, Number(netSales) || 0);
  const opening = calculateOpeningBonus(sales, openings);
  const ordinaryCommission = sales * 0.03;
  const accelerator = calculateFelixAccelerator(sales);
  const additionalIncentive = accelerator + opening.unlocked;
  return {
    period,
    netSales: sales,
    ordinaryCommission,
    accelerator,
    openings: openings.slice(0, FELIX_INCENTIVE_MAX_OPENINGS),
    openingMilestones: opening.milestones,
    openingBonusPotential: opening.potential,
    openingBonus: opening.unlocked,
    additionalIncentive,
    totalVariable: ordinaryCommission + additionalIncentive,
    progressMinimum: Math.min(100, (sales / FELIX_INCENTIVE_MINIMUM) * 100),
    progressHealthy: Math.min(100, (sales / FELIX_INCENTIVE_HEALTHY) * 100),
    amountToMinimum: Math.max(0, FELIX_INCENTIVE_MINIMUM - sales),
    lastUpdatedAt,
  };
}

export function buildFelixIncentiveSnapshot({
  todayKey,
  salesByPeriod = {},
  openingsByPeriod = {},
  updatedAtByPeriod = {},
  dataWarning = null,
}: SnapshotInput): FelixIncentiveSnapshot {
  const status: FelixIncentiveStatus =
    todayKey < FELIX_INCENTIVE_START
      ? "upcoming"
      : todayKey > FELIX_INCENTIVE_END
        ? "ended"
        : "active";

  const currentPeriod =
    status === "upcoming"
      ? monthStart(FELIX_INCENTIVE_START)
      : status === "ended"
        ? monthStart(FELIX_INCENTIVE_END)
        : monthStart(todayKey);

  const months = listPeriods(monthStart(FELIX_INCENTIVE_START), currentPeriod).map(
    (period) =>
      buildMonth(
        period,
        salesByPeriod[period] ?? 0,
        openingsByPeriod[period] ?? [],
        updatedAtByPeriod[period] ?? null,
      ),
  );

  return {
    status,
    todayKey,
    currentPeriod,
    daysUntilStart:
      status === "upcoming" ? daysBetween(todayKey, FELIX_INCENTIVE_START) : 0,
    current: months[months.length - 1],
    months,
    dataWarning,
  };
}
