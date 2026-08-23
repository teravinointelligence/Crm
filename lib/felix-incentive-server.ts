import "server-only";
import type { SalesRep } from "@/types/database";
import { createClient } from "@/lib/supabase/server";
import { dateKeyTz } from "@/lib/utils";
import {
  FELIX_INCENTIVE_END,
  FELIX_INCENTIVE_START,
  buildFelixIncentiveSnapshot,
  isFelixIncentiveUser,
  type FelixIncentiveSnapshot,
  type FelixOpening,
} from "@/lib/felix-incentive";

type SaleRow = {
  period: string;
  neto_desc: number | string | null;
  updated_at: string | null;
};

type InvoiceRow = {
  id: string;
  account_id: string;
  invoice_date: string;
  subtotal: number | string | null;
  status: string | null;
  accounts: { business_name: string | null } | { business_name: string | null }[] | null;
};

function accountName(invoice: InvoiceRow): string {
  const account = Array.isArray(invoice.accounts) ? invoice.accounts[0] : invoice.accounts;
  return account?.business_name?.trim() || "Cuenta nueva";
}

function addDays(dateKey: string, days: number): string {
  const d = new Date(`${dateKey}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function qualifiedOpenings(invoices: InvoiceRow[]): Record<string, FelixOpening[]> {
  const byAccount = new Map<string, InvoiceRow[]>();
  for (const invoice of invoices) {
    const rows = byAccount.get(invoice.account_id) ?? [];
    rows.push(invoice);
    byAccount.set(invoice.account_id, rows);
  }

  const byPeriod: Record<string, FelixOpening[]> = {};
  for (const [accountId, rows] of byAccount) {
    rows.sort(
      (a, b) => a.invoice_date.localeCompare(b.invoice_date) || a.id.localeCompare(b.id),
    );
    // Una factura cancelada no constituye una compra y no debe descalificar
    // una apertura que sí se concrete después.
    const purchaseRows = rows.filter((row) => row.status !== "cancelada");
    const first = purchaseRows[0];
    if (
      !first ||
      first.invoice_date < FELIX_INCENTIVE_START ||
      first.invoice_date > FELIX_INCENTIVE_END ||
      first.status !== "pagada" ||
      Number(first.subtotal ?? 0) < 10_000
    ) {
      continue;
    }

    const repeatLimit = addDays(first.invoice_date, 45);
    const repeat = purchaseRows.find(
      (row, index) =>
        index > 0 &&
        row.invoice_date <= repeatLimit &&
        row.status === "pagada" &&
        Number(row.subtotal ?? 0) >= 10_000,
    );
    const period = `${first.invoice_date.slice(0, 7)}-01`;
    const openings = byPeriod[period] ?? [];
    openings.push({
      accountId,
      accountName: accountName(first),
      firstPurchaseDate: first.invoice_date,
      repeatPurchaseDate: repeat?.invoice_date ?? null,
    });
    byPeriod[period] = openings;
  }

  for (const openings of Object.values(byPeriod)) {
    openings.sort((a, b) => a.firstPurchaseDate.localeCompare(b.firstPurchaseDate));
  }
  return byPeriod;
}

export async function loadFelixIncentiveSnapshot(
  rep: Pick<SalesRep, "id" | "email">,
  now = new Date(),
): Promise<FelixIncentiveSnapshot | null> {
  if (!isFelixIncentiveUser(rep.email)) return null;

  const todayKey = dateKeyTz(now);
  const throughDate = todayKey < FELIX_INCENTIVE_END ? todayKey : FELIX_INCENTIVE_END;
  const supabase = createClient();
  const [salesResult, invoicesResult] = await Promise.all([
    supabase
      .from("monthly_sales")
      .select("period, neto_desc, updated_at")
      .eq("sales_rep_id", rep.id)
      .gte("period", FELIX_INCENTIVE_START)
      .lte("period", FELIX_INCENTIVE_END)
      .order("period"),
    supabase
      .from("invoices")
      .select("id, account_id, invoice_date, subtotal, status, accounts:account_id(business_name)")
      .lte("invoice_date", throughDate)
      .order("invoice_date"),
  ]);

  const salesByPeriod: Record<string, number> = {};
  const updatedAtByPeriod: Record<string, string | null> = {};
  for (const row of (salesResult.data ?? []) as SaleRow[]) {
    salesByPeriod[row.period] =
      (salesByPeriod[row.period] ?? 0) + Number(row.neto_desc ?? 0);
    const previous = updatedAtByPeriod[row.period];
    if (row.updated_at && (!previous || row.updated_at > previous)) {
      updatedAtByPeriod[row.period] = row.updated_at;
    }
  }

  const dataWarning = salesResult.error
    ? "No pudimos actualizar las ventas del incentivo. Intenta de nuevo en unos minutos."
    : invoicesResult.error
      ? "Las ventas están actualizadas; las aperturas están pendientes de validación."
      : null;

  return buildFelixIncentiveSnapshot({
    todayKey,
    salesByPeriod,
    openingsByPeriod: invoicesResult.error
      ? {}
      : qualifiedOpenings((invoicesResult.data ?? []) as unknown as InvoiceRow[]),
    updatedAtByPeriod,
    dataWarning,
  });
}
