export const PERSONAL_INCENTIVE_START = "2026-09-01";
export const PERSONAL_INCENTIVE_END = "2026-11-30";
export const PERSONAL_SALES_HISTORY_START = "2026-01-01";
export const PERSONAL_ACTION_BONUS = 1_500;
export const PERSONAL_COLLECTION_RELEASE_BONUS = 1_000;

export type PersonalIncentiveKey =
  | "felix"
  | "citlali"
  | "yamile"
  | "andra"
  | "emmanuel";

export type PersonalIncentiveStatus = "upcoming" | "active" | "ended";

export type PersonalIncentiveConfig = {
  key: PersonalIncentiveKey;
  email: string;
  firstName: string;
  region: string;
  announcementTitle: string;
  announcementBody: string;
  recognition: string;
  salesTargets: Record<string, number>;
  actionChallenge: boolean;
  collectionGoal: number;
};

export type PersonalAccountMilestone = {
  accountId: string;
  accountName: string;
  invoiceDate: string;
  amount: number;
  paid: boolean;
};

export type PersonalIncentiveMonth = {
  period: string;
  salesTarget: number | null;
  netSales: number;
  salesProgress: number;
  salesBonusRate: number;
  salesBonus: number;
  openings: PersonalAccountMilestone[];
  reactivations: PersonalAccountMilestone[];
  openingBonus: number;
  reactivationBonus: number;
  actionBonus: number;
  collectionGoal: number;
  startingOverdue: number;
  collectedOverdue: number;
  collectionProgress: number;
  collectionTierBonus: number;
  releasedAccounts: number;
  collectionReleaseBonus: number;
  collectionBonus: number;
  totalAdditional: number;
};

export type PersonalSalesHistoryMonth = {
  period: string;
  netSales: number;
  target: number | null;
  progress: number | null;
  status: "closed" | "current" | "upcoming";
};

export type PersonalIncentiveSnapshot = {
  repId: string;
  repName: string;
  config: PersonalIncentiveConfig;
  status: PersonalIncentiveStatus;
  todayKey: string;
  currentPeriod: string;
  daysUntilStart: number;
  current: PersonalIncentiveMonth;
  months: PersonalIncentiveMonth[];
  salesHistory: PersonalSalesHistoryMonth[];
  dataWarning: string | null;
};

const CONFIGS: PersonalIncentiveConfig[] = [
  {
    key: "felix",
    email: "felix@teravino.com",
    firstName: "Félix",
    region: "Vallarta",
    announcementTitle: "Tu incentivo Vallarta ahora incluye cobranza",
    announcementBody:
      "Además de tus ventas y aperturas, podrás desbloquear hasta $3,000 al mes recuperando cartera vencida y liberando clientes suspendidos.",
    recognition: "Crecimiento, aperturas pagadas y recuperación de cartera",
    salesTargets: {},
    actionChallenge: false,
    collectionGoal: 15_000,
  },
  {
    key: "citlali",
    email: "citlali@teravino.com",
    firstName: "Citlali",
    region: "La Paz",
    announcementTitle: "¡Viaje a California desbloqueado!",
    announcementBody:
      "Tu constancia y tus resultados hicieron posible este reconocimiento. También estrenas metas personales de ventas, cuentas pagadas y cobranza.",
    recognition: "Viaje a California confirmado",
    salesTargets: {
      "2026-09-01": 275_000,
      "2026-10-01": 325_000,
      "2026-11-01": 350_000,
    },
    actionChallenge: true,
    collectionGoal: 75_000,
  },
  {
    key: "yamile",
    email: "yamile@teravino.com",
    firstName: "Yamile",
    region: "Los Cabos",
    announcementTitle: "Pasaporte y visa 2027 desbloqueados",
    announcementBody:
      "Como reconocimiento a tu desempeño, Teravino cubrirá tu pasaporte, los derechos de visa y el apoyo para realizar el trámite. La autorización depende de la autoridad consular.",
    recognition: "Apoyo para pasaporte y visa de futuros viajes 2027",
    salesTargets: {
      "2026-09-01": 400_000,
      "2026-10-01": 750_000,
      "2026-11-01": 900_000,
    },
    actionChallenge: true,
    collectionGoal: 140_000,
  },
  {
    key: "andra",
    email: "andra@teravino.com",
    firstName: "Andra",
    region: "Los Cabos",
    announcementTitle: "¡Tu viaje a California está confirmado!",
    announcementBody:
      "Tu desempeño comercial acumulado te ha hecho merecedora de representar a Teravino. Ahora tienes nuevas metas de recuperación y crecimiento.",
    recognition: "Lugar confirmado en el viaje a California",
    salesTargets: {
      "2026-09-01": 500_000,
      "2026-10-01": 600_000,
      "2026-11-01": 700_000,
    },
    actionChallenge: true,
    collectionGoal: 215_000,
  },
  {
    key: "emmanuel",
    email: "emmanuel@teravino.com",
    firstName: "Emmanuel",
    region: "Tijuana",
    announcementTitle: "Nuevo reto Tijuana desbloqueado",
    announcementBody:
      "Tu crecimiento está tomando fuerza. Convierte degustaciones en clientes recurrentes, recupera cartera y desbloquea nuevos incentivos.",
    recognition: "Consolidación del crecimiento de Tijuana",
    salesTargets: {
      "2026-09-01": 225_000,
      "2026-10-01": 275_000,
      "2026-11-01": 300_000,
    },
    actionChallenge: true,
    collectionGoal: 40_000,
  },
];

const CONFIG_BY_EMAIL = new Map(CONFIGS.map((config) => [config.email, config]));

export const PERSONAL_INCENTIVE_EMAILS = CONFIGS.map((config) => config.email);

export function getPersonalIncentiveConfig(
  email: string | null | undefined,
): PersonalIncentiveConfig | null {
  return CONFIG_BY_EMAIL.get(String(email ?? "").trim().toLowerCase()) ?? null;
}

export function isPersonalIncentiveUser(email: string | null | undefined): boolean {
  return getPersonalIncentiveConfig(email) !== null;
}

export function calculatePersonalSalesBonus(
  netSales: number,
  target: number | null,
): { rate: number; bonus: number; progress: number } {
  const sales = Math.max(0, Number(netSales) || 0);
  const goal = Math.max(0, Number(target) || 0);
  if (!goal) return { rate: 0, bonus: 0, progress: 0 };

  const progress = Math.round((sales / goal) * 100_000) / 1_000;
  const rate =
    progress >= 120 ? 0.01 : progress >= 110 ? 0.0075 : progress >= 100 ? 0.005 : 0;
  return { rate, bonus: sales * rate, progress };
}

export function calculatePersonalActionBonus(params: {
  paidOpenings: number;
  paidReactivations: number;
  enabled: boolean;
}): { openingBonus: number; reactivationBonus: number; total: number } {
  if (!params.enabled) return { openingBonus: 0, reactivationBonus: 0, total: 0 };
  const openingBonus = params.paidOpenings > 0 ? PERSONAL_ACTION_BONUS : 0;
  const reactivationBonus = params.paidReactivations > 0 ? PERSONAL_ACTION_BONUS : 0;
  return { openingBonus, reactivationBonus, total: openingBonus + reactivationBonus };
}

export function calculatePersonalCollectionBonus(params: {
  collected: number;
  goal: number;
  releasedAccounts: number;
}): {
  progress: number;
  tierBonus: number;
  releaseBonus: number;
  total: number;
} {
  const collected = Math.max(0, Number(params.collected) || 0);
  const goal = Math.max(0, Number(params.goal) || 0);
  const progress = goal ? (collected / goal) * 100 : 0;
  const tierBonus =
    progress >= 100 ? 2_000 : progress >= 75 ? 1_500 : progress >= 50 ? 1_000 : 0;
  const releaseBonus = params.releasedAccounts > 0 ? PERSONAL_COLLECTION_RELEASE_BONUS : 0;
  return {
    progress,
    tierBonus,
    releaseBonus,
    total: Math.min(3_000, tierBonus + releaseBonus),
  };
}

export function personalIncentiveStatus(todayKey: string): PersonalIncentiveStatus {
  if (todayKey < PERSONAL_INCENTIVE_START) return "upcoming";
  if (todayKey > PERSONAL_INCENTIVE_END) return "ended";
  return "active";
}

export function monthStart(dateKey: string): string {
  return `${dateKey.slice(0, 7)}-01`;
}

export function addMonth(period: string): string {
  const year = Number(period.slice(0, 4));
  const month = Number(period.slice(5, 7));
  return new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
}

export function listPersonalIncentivePeriods(currentPeriod: string): string[] {
  const periods: string[] = [];
  for (let period = PERSONAL_INCENTIVE_START; period <= currentPeriod; period = addMonth(period)) {
    periods.push(period);
  }
  return periods;
}

export function listPersonalSalesHistoryPeriods(): string[] {
  const periods: string[] = [];
  for (
    let period = PERSONAL_SALES_HISTORY_START;
    period <= monthStart(PERSONAL_INCENTIVE_END);
    period = addMonth(period)
  ) {
    periods.push(period);
  }
  return periods;
}

export function daysBetween(from: string, to: string): number {
  const start = Date.parse(`${from}T12:00:00Z`);
  const end = Date.parse(`${to}T12:00:00Z`);
  return Math.max(0, Math.ceil((end - start) / 86_400_000));
}
