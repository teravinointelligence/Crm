import "server-only";
import type { SalesRep } from "@/types/database";
import { createClient } from "@/lib/supabase/server";
import { dateKeyTz } from "@/lib/utils";
import { FELIX_INCENTIVE_MINIMUM } from "@/lib/felix-incentive";
import {
  PERSONAL_INCENTIVE_EMAILS,
  PERSONAL_INCENTIVE_END,
  PERSONAL_INCENTIVE_START,
  PERSONAL_SALES_HISTORY_START,
  addMonth,
  calculatePersonalActionBonus,
  calculatePersonalCollectionBonus,
  calculatePersonalSalesBonus,
  daysBetween,
  getPersonalIncentiveConfig,
  listPersonalIncentivePeriods,
  listPersonalSalesHistoryPeriods,
  monthStart,
  personalIncentiveStatus,
  type PersonalAccountMilestone,
  type PersonalIncentiveMonth,
  type PersonalIncentiveSnapshot,
} from "@/lib/personal-incentives";
import type { SalesTargetBasis, SalesTargetStatus } from "@/lib/sales-targets";
import { calculateSeasonalSalesTarget } from "@/lib/sales-targets";

type DbClient = ReturnType<typeof createClient>;

type AccountRow = {
  id: string;
  business_name: string | null;
  is_legacy: boolean | null;
  es_socio: boolean | null;
};

type SaleRow = {
  period: string;
  neto_desc: number | string | null;
};

type SalesTargetRow = {
  id: string;
  period: string;
  target_amount: number | string;
  minimum_floor: number | string;
  recent_average: number | string;
  prior_year_sales: number | string;
  ytd_factor: number | string;
  recent_stretch: number | string;
  seasonal_stretch: number | string;
  selected_basis: SalesTargetBasis;
  status: SalesTargetStatus;
};

type ResolvedSalesTarget = {
  id: string | null;
  target: number;
  status: SalesTargetStatus;
  minimumFloor: number;
  recentAverage: number | null;
  priorYearSales: number | null;
  ytdFactor: number | null;
  recentStretch: number | null;
  seasonalStretch: number | null;
  selectedBasis: SalesTargetBasis | null;
};

function previousMonth(period: string): string {
  const year = Number(period.slice(0, 4));
  const month = Number(period.slice(5, 7));
  return new Date(Date.UTC(year, month - 2, 1)).toISOString().slice(0, 10);
}

function previousYear(period: string): string {
  return `${Number(period.slice(0, 4)) - 1}${period.slice(4)}`;
}

function resolveSalesTarget(params: {
  period: string;
  todayPeriod: string;
  floor: number;
  fallbackTarget: number | null;
  row: SalesTargetRow | undefined;
  salesByPeriod: Record<string, number>;
}): ResolvedSalesTarget | null {
  const { period, todayPeriod, row, salesByPeriod } = params;
  if (row?.status === "locked" || row?.status === "overridden") {
    return {
      id: row.id,
      target: Number(row.target_amount),
      status: row.status,
      minimumFloor: Number(row.minimum_floor),
      recentAverage: Number(row.recent_average),
      priorYearSales: Number(row.prior_year_sales),
      ytdFactor: Number(row.ytd_factor),
      recentStretch: Number(row.recent_stretch),
      seasonalStretch: Number(row.seasonal_stretch),
      selectedBasis: row.selected_basis,
    };
  }

  const targetYear = period.slice(0, 4);
  const lastAllowedClosed = previousMonth(period < todayPeriod ? period : todayPeriod);
  const closedPeriods = Object.keys(salesByPeriod)
    .filter((salePeriod) => salePeriod.startsWith(targetYear) && salePeriod <= lastAllowedClosed)
    .sort();
  const calculationAsOf = closedPeriods.at(-1);
  if (!calculationAsOf) {
    const fallbackTarget = Number(row?.target_amount ?? params.fallbackTarget ?? 0);
    return fallbackTarget
      ? {
          id: row?.id ?? null,
          target: fallbackTarget,
          status: period <= todayPeriod ? "locked" : "projection",
          minimumFloor: params.floor,
          recentAverage: null,
          priorYearSales: null,
          ytdFactor: null,
          recentStretch: null,
          seasonalStretch: null,
          selectedBasis: null,
        }
      : null;
  }

  const cutoffMonth = calculationAsOf.slice(5, 7);
  const priorYear = String(Number(targetYear) - 1);
  const currentYtdSales = Object.entries(salesByPeriod)
    .filter(([salePeriod]) => salePeriod >= `${targetYear}-01-01` && salePeriod <= `${targetYear}-${cutoffMonth}-01`)
    .reduce((total, [, amount]) => total + amount, 0);
  const priorYtdSales = Object.entries(salesByPeriod)
    .filter(([salePeriod]) => salePeriod >= `${priorYear}-01-01` && salePeriod <= `${priorYear}-${cutoffMonth}-01`)
    .reduce((total, [, amount]) => total + amount, 0);
  const calculation = calculateSeasonalSalesTarget({
    minimumFloor: params.floor,
    recentClosedSales: closedPeriods.slice(-3).map((salePeriod) => salesByPeriod[salePeriod] ?? 0),
    priorYearSales: salesByPeriod[previousYear(period)] ?? 0,
    currentYtdSales,
    priorYtdSales,
  });
  return {
    id: row?.id ?? null,
    target: calculation.target,
    status: period <= todayPeriod ? "locked" : "projection",
    minimumFloor: calculation.minimumFloor,
    recentAverage: calculation.recentAverage,
    priorYearSales: calculation.priorYearSales,
    ytdFactor: calculation.ytdFactor,
    recentStretch: calculation.recentStretch,
    seasonalStretch: calculation.seasonalStretch,
    selectedBasis: calculation.selectedBasis,
  };
}

type InvoiceRow = {
  id: string;
  account_id: string;
  invoice_date: string;
  due_date: string;
  subtotal: number | string | null;
  total: number | string | null;
  balance: number | string | null;
  status: string | null;
};

type PaymentAllocationRow = {
  invoice_id: string;
  amount_applied: number | string | null;
};

type PaymentRow = {
  id: string;
  invoice_id: string | null;
  payment_date: string;
  amount: number | string | null;
  confirmado: boolean | null;
  payment_allocations: PaymentAllocationRow[] | null;
};

type BalanceRow = {
  account_id: string;
  saldo_vencido: number | string | null;
  dias_vencido: number | null;
};

type PaymentApplication = {
  invoiceId: string;
  paymentDate: string;
  amount: number;
};

function nextDay(dateKey: string): string {
  const date = new Date(`${dateKey}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function dateOffset(dateKey: string, days: number): string {
  const date = new Date(`${dateKey}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function paidInvoice(invoice: InvoiceRow): boolean {
  if (invoice.status === "cancelada") return false;
  return invoice.status === "pagada" || Number(invoice.balance ?? 0) <= 0.01;
}

function daysApart(from: string, to: string): number {
  return Math.floor(
    (Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000,
  );
}

function actionMilestones(params: {
  accounts: AccountRow[];
  invoices: InvoiceRow[];
  period: string;
}): { openings: PersonalAccountMilestone[]; reactivations: PersonalAccountMilestone[] } {
  const nextPeriod = addMonth(params.period);
  const accountName = new Map(
    params.accounts.map((account) => [account.id, account.business_name?.trim() || "Cuenta"]),
  );
  const invoicesByAccount = new Map<string, InvoiceRow[]>();

  for (const invoice of params.invoices) {
    if (invoice.status === "cancelada") continue;
    const rows = invoicesByAccount.get(invoice.account_id) ?? [];
    rows.push(invoice);
    invoicesByAccount.set(invoice.account_id, rows);
  }

  const openings: PersonalAccountMilestone[] = [];
  const reactivations: PersonalAccountMilestone[] = [];
  for (const [accountId, rows] of invoicesByAccount) {
    rows.sort(
      (a, b) => a.invoice_date.localeCompare(b.invoice_date) || a.id.localeCompare(b.id),
    );
    const previous = rows.filter((row) => row.invoice_date < params.period);
    // La primera compra del periodo debe ser la que cumpla el mínimo. No se
    // permite convertir una compra pequeña inicial en "apertura" o
    // "reactivación" usando una segunda factura del mismo mes.
    const candidate = rows.find(
      (row) => row.invoice_date >= params.period && row.invoice_date < nextPeriod,
    );
    if (!candidate || Number(candidate.subtotal ?? 0) < 10_000) continue;

    const milestone: PersonalAccountMilestone = {
      accountId,
      accountName: accountName.get(accountId) ?? "Cuenta",
      invoiceDate: candidate.invoice_date,
      amount: Number(candidate.subtotal ?? 0),
      paid: paidInvoice(candidate),
    };

    if (previous.length === 0) {
      openings.push(milestone);
      continue;
    }

    const previousPurchase = previous[previous.length - 1];
    if (daysApart(previousPurchase.invoice_date, candidate.invoice_date) >= 90) {
      reactivations.push(milestone);
    }
  }

  const byDate = (a: PersonalAccountMilestone, b: PersonalAccountMilestone) =>
    a.invoiceDate.localeCompare(b.invoiceDate) || a.accountName.localeCompare(b.accountName);
  openings.sort(byDate);
  reactivations.sort(byDate);
  return { openings, reactivations };
}

function paymentApplications(payments: PaymentRow[]): PaymentApplication[] {
  const applications: PaymentApplication[] = [];
  for (const payment of payments) {
    if (payment.confirmado === false) continue;
    const allocations = payment.payment_allocations ?? [];
    if (allocations.length) {
      for (const allocation of allocations) {
        applications.push({
          invoiceId: allocation.invoice_id,
          paymentDate: payment.payment_date,
          amount: Number(allocation.amount_applied ?? 0),
        });
      }
      continue;
    }
    if (payment.invoice_id) {
      applications.push({
        invoiceId: payment.invoice_id,
        paymentDate: payment.payment_date,
        amount: Number(payment.amount ?? 0),
      });
    }
  }
  return applications.filter((application) => application.amount > 0);
}

function collectionMetrics(params: {
  period: string;
  todayKey: string;
  invoices: InvoiceRow[];
  applications: PaymentApplication[];
  balances: BalanceRow[];
}): { startingOverdue: number; collected: number; releasedAccounts: number } {
  if (params.todayKey < params.period) {
    return {
      startingOverdue: params.balances.reduce(
        (total, balance) => total + Number(balance.saldo_vencido ?? 0),
        0,
      ),
      collected: 0,
      releasedAccounts: 0,
    };
  }

  const nextPeriod = addMonth(params.period);
  const throughExclusive = params.todayKey < nextPeriod ? nextDay(params.todayKey) : nextPeriod;
  const appsByInvoice = new Map<string, PaymentApplication[]>();
  for (const application of params.applications) {
    const rows = appsByInvoice.get(application.invoiceId) ?? [];
    rows.push(application);
    appsByInvoice.set(application.invoiceId, rows);
  }

  const relevantInvoices = params.invoices.filter(
    (invoice) => invoice.status !== "cancelada" && invoice.due_date < params.period,
  );
  let startingOverdue = 0;
  let collected = 0;
  const suspendedAtStart = new Set<string>();

  for (const invoice of relevantInvoices) {
    const applications = appsByInvoice.get(invoice.id) ?? [];
    const paidAfterStart = applications
      .filter((application) => application.paymentDate >= params.period)
      .reduce((total, application) => total + application.amount, 0);
    const startBalance = Number(invoice.balance ?? 0) + paidAfterStart;
    if (startBalance <= 0.01) continue;

    startingOverdue += startBalance;
    if (invoice.due_date <= dateOffset(params.period, -45)) {
      suspendedAtStart.add(invoice.account_id);
    }
    collected += applications
      .filter(
        (application) =>
          application.paymentDate >= params.period && application.paymentDate < throughExclusive,
      )
      .reduce((total, application) => total + application.amount, 0);
  }

  let releasedAccounts = 0;
  for (const accountId of suspendedAtStart) {
    const endOverdue = params.invoices
      .filter(
        (invoice) =>
          invoice.account_id === accountId &&
          invoice.status !== "cancelada" &&
          invoice.due_date < throughExclusive,
      )
      .reduce((total, invoice) => {
        const paidAfterEnd = (appsByInvoice.get(invoice.id) ?? [])
          .filter((application) => application.paymentDate >= throughExclusive)
          .reduce((sum, application) => sum + application.amount, 0);
        return total + Number(invoice.balance ?? 0) + paidAfterEnd;
      }, 0);
    if (endOverdue <= 0.01) releasedAccounts += 1;
  }

  return { startingOverdue, collected, releasedAccounts };
}

function emptyMonth(period: string, collectionGoal: number): PersonalIncentiveMonth {
  return {
    period,
    salesTarget: null,
    salesTargetStatus: null,
    netSales: 0,
    salesProgress: 0,
    salesBonusRate: 0,
    salesBonus: 0,
    openings: [],
    reactivations: [],
    openingBonus: 0,
    reactivationBonus: 0,
    actionBonus: 0,
    collectionGoal,
    startingOverdue: 0,
    collectedOverdue: 0,
    collectionProgress: 0,
    collectionTierBonus: 0,
    releasedAccounts: 0,
    collectionReleaseBonus: 0,
    collectionBonus: 0,
    totalAdditional: 0,
  };
}

export async function loadPersonalIncentiveSnapshot(
  rep: Pick<SalesRep, "id" | "email" | "full_name">,
  now = new Date(),
  db: DbClient = createClient(),
): Promise<PersonalIncentiveSnapshot | null> {
  const config = getPersonalIncentiveConfig(rep.email);
  if (!config) return null;

  const todayKey = dateKeyTz(now);
  const status = personalIncentiveStatus(todayKey);
  const currentPeriod =
    status === "upcoming"
      ? PERSONAL_INCENTIVE_START
      : status === "ended"
        ? monthStart(PERSONAL_INCENTIVE_END)
        : monthStart(todayKey);
  const periods = listPersonalIncentivePeriods(currentPeriod);
  const throughDate = todayKey < PERSONAL_INCENTIVE_START
    ? PERSONAL_INCENTIVE_START
    : todayKey > PERSONAL_INCENTIVE_END
      ? PERSONAL_INCENTIVE_END
      : todayKey;

  const [salesResult, accountsResult, targetsResult] = await Promise.all([
    db
      .from("monthly_sales")
      .select("period, neto_desc")
      .eq("sales_rep_id", rep.id)
      .gte("period", `${Number(PERSONAL_SALES_HISTORY_START.slice(0, 4)) - 1}-01-01`)
      .lte("period", PERSONAL_INCENTIVE_END)
      .limit(5_000),
    db
      .from("accounts")
      .select("id, business_name, is_legacy, es_socio")
      .eq("assigned_rep_id", rep.id)
      .limit(5_000),
    db
      .from("seller_monthly_targets")
      .select(
        "id, period, target_amount, minimum_floor, recent_average, prior_year_sales, ytd_factor, recent_stretch, seasonal_stretch, selected_basis, status",
      )
      .eq("sales_rep_id", rep.id)
      .gte("period", PERSONAL_INCENTIVE_START)
      .lte("period", PERSONAL_INCENTIVE_END)
      .order("period"),
  ]);

  const accounts = ((accountsResult.data ?? []) as AccountRow[]).filter(
    (account) => !account.is_legacy && !account.es_socio,
  );
  const accountIds = accounts.map((account) => account.id);
  const emptyResult = { data: [], error: null };
  const [invoicesResult, paymentsResult, balancesResult] = accountIds.length
    ? await Promise.all([
        db
          .from("invoices")
          .select("id, account_id, invoice_date, due_date, subtotal, total, balance, status")
          .in("account_id", accountIds)
          .lte("invoice_date", throughDate)
          .order("invoice_date")
          .limit(5_000),
        db
          .from("payments")
          .select(
            "id, invoice_id, payment_date, amount, confirmado, payment_allocations(invoice_id, amount_applied)",
          )
          .in("account_id", accountIds)
          .gte("payment_date", PERSONAL_INCENTIVE_START)
          .lte("payment_date", throughDate)
          .order("payment_date")
          .limit(5_000),
        db
          .from("v_account_balance")
          .select("account_id, saldo_vencido, dias_vencido")
          .in("account_id", accountIds)
          .limit(5_000),
      ])
    : [emptyResult, emptyResult, emptyResult];

  const salesByPeriod: Record<string, number> = {};
  for (const row of (salesResult.data ?? []) as SaleRow[]) {
    salesByPeriod[row.period] =
      (salesByPeriod[row.period] ?? 0) + Number(row.neto_desc ?? 0);
  }
  const targetByPeriod = new Map(
    ((targetsResult.data ?? []) as SalesTargetRow[]).map((row) => [row.period, row]),
  );
  const todayPeriod = monthStart(todayKey);

  const invoices = (invoicesResult.data ?? []) as InvoiceRow[];
  const applications = paymentApplications(
    (paymentsResult.data ?? []) as unknown as PaymentRow[],
  );
  const balances = (balancesResult.data ?? []) as BalanceRow[];
  const months = periods.map((period) => {
    const month = emptyMonth(period, config.collectionGoal);
    const targetRow = targetByPeriod.get(period);
    const resolvedTarget = resolveSalesTarget({
      period,
      todayPeriod,
      floor: config.salesFloors[period] ?? 0,
      fallbackTarget: config.salesTargets[period] ?? null,
      row: targetRow,
      salesByPeriod,
    });
    // Félix conserva su esquema anual Vallarta separado para no duplicar el
    // bono de ventas. La meta dinámica sí aparece en la vista de Dirección.
    const salesTarget = config.key === "felix"
      ? null
      : resolvedTarget?.target ?? null;
    const netSales = salesByPeriod[period] ?? 0;
    const sales = calculatePersonalSalesBonus(netSales, salesTarget);
    const actions = config.actionChallenge
      ? actionMilestones({ accounts, invoices, period })
      : { openings: [], reactivations: [] };
    const actionBonus = calculatePersonalActionBonus({
      paidOpenings: actions.openings.filter((opening) => opening.paid).length,
      paidReactivations: actions.reactivations.filter((reactivation) => reactivation.paid).length,
      enabled: config.actionChallenge,
    });
    const collection = collectionMetrics({
      period,
      todayKey,
      invoices,
      applications,
      balances,
    });
    const collectionBonus = calculatePersonalCollectionBonus({
      collected: collection.collected,
      goal: config.collectionGoal,
      releasedAccounts: collection.releasedAccounts,
    });

    return {
      ...month,
      salesTarget,
      salesTargetStatus: salesTarget ? resolvedTarget?.status ?? null : null,
      netSales,
      salesProgress: sales.progress,
      salesBonusRate: sales.rate,
      salesBonus: sales.bonus,
      openings: actions.openings,
      reactivations: actions.reactivations,
      openingBonus: actionBonus.openingBonus,
      reactivationBonus: actionBonus.reactivationBonus,
      actionBonus: actionBonus.total,
      startingOverdue: collection.startingOverdue,
      collectedOverdue: collection.collected,
      collectionProgress: collectionBonus.progress,
      collectionTierBonus: collectionBonus.tierBonus,
      releasedAccounts: collection.releasedAccounts,
      collectionReleaseBonus: collectionBonus.releaseBonus,
      collectionBonus: collectionBonus.total,
      totalAdditional: sales.bonus + actionBonus.total + collectionBonus.total,
    };
  });

  const salesHistory = listPersonalSalesHistoryPeriods().map((period) => {
    const targetRow = targetByPeriod.get(period);
    const fallbackTarget =
      config.key === "felix" && period >= PERSONAL_INCENTIVE_START
        ? config.salesTargets[period] ?? FELIX_INCENTIVE_MINIMUM
        : config.salesTargets[period] ?? null;
    const resolvedTarget = resolveSalesTarget({
      period,
      todayPeriod,
      floor: config.salesFloors[period] ?? 0,
      fallbackTarget,
      row: targetRow,
      salesByPeriod,
    });
    const target = resolvedTarget?.target ?? null;
    const netSales = salesByPeriod[period] ?? 0;
    return {
      period,
      netSales,
      target,
      targetId: resolvedTarget?.id ?? null,
      targetStatus: resolvedTarget?.status ?? null,
      minimumFloor: resolvedTarget?.minimumFloor ?? null,
      recentAverage: resolvedTarget?.recentAverage ?? null,
      priorYearSales: resolvedTarget?.priorYearSales ?? null,
      ytdFactor: resolvedTarget?.ytdFactor ?? null,
      recentStretch: resolvedTarget?.recentStretch ?? null,
      seasonalStretch: resolvedTarget?.seasonalStretch ?? null,
      selectedBasis: resolvedTarget?.selectedBasis ?? null,
      progress: target ? calculatePersonalSalesBonus(netSales, target).progress : null,
      status:
        period < todayPeriod ? "closed" as const : period === todayPeriod ? "current" as const : "upcoming" as const,
    };
  });

  const warnings = [
    salesResult.error ? "ventas" : null,
    accountsResult.error ? "cartera" : null,
    invoicesResult.error ? "facturas" : null,
    paymentsResult.error ? "pagos" : null,
    balancesResult.error ? "saldos" : null,
    targetsResult.error ? "metas dinámicas" : null,
  ].filter(Boolean);

  return {
    repId: rep.id,
    repName: rep.full_name,
    config,
    status,
    todayKey,
    currentPeriod,
    daysUntilStart:
      status === "upcoming" ? daysBetween(todayKey, PERSONAL_INCENTIVE_START) : 0,
    current: months[months.length - 1] ?? emptyMonth(currentPeriod, config.collectionGoal),
    months,
    salesHistory,
    dataWarning: warnings.length
      ? `No pudimos actualizar ${warnings.join(", ")}. El resto del medidor sigue disponible.`
      : null,
  };
}

export async function loadTeamPersonalIncentives(
  db: DbClient = createClient(),
  now = new Date(),
): Promise<PersonalIncentiveSnapshot[]> {
  const { data } = await db
    .from("sales_reps")
    .select("id, email, full_name")
    .eq("active", true)
    .in("email", PERSONAL_INCENTIVE_EMAILS)
    .order("full_name");
  const reps = (data ?? []) as Pick<SalesRep, "id" | "email" | "full_name">[];
  const snapshots = await Promise.all(
    reps.map((rep) => loadPersonalIncentiveSnapshot(rep, now, db)),
  );
  return snapshots.filter((snapshot): snapshot is PersonalIncentiveSnapshot => snapshot !== null);
}
