// Inteligencia por cuenta (server-only): arma los insumos de churn, cross-sell
// y Next Best Action desde tablas existentes (sin migración). La lógica pura
// vive en lib/churn.ts y lib/cross-sell.ts; aquí solo se consultan datos.

import "server-only";
import type { createClient } from "@/lib/supabase/server";
import { computeChurn, CHURN_RANK, type ChurnResult, type ChurnStatus } from "@/lib/churn";
import { recommendForAccount, type AccountBasket, type Recommendation } from "@/lib/cross-sell";

type DbClient = ReturnType<typeof createClient>;

type MsRow = { id: string; account_id: string; period: string; venta_bruta: number | null };
type ItemRow = { monthly_sale_id: string; codigo: string | null; producto_nombre: string; cantidad: number | null; total: number | null };

/** Carga monthly_sales + items una vez y arma las canastas por cuenta. */
async function loadSalesUniverse(supabase: DbClient) {
  const { data: ms } = await supabase
    .from("monthly_sales")
    .select("id, account_id, period, venta_bruta");
  const sales = (ms ?? []) as MsRow[];
  const saleToAccount = new Map(sales.map((s) => [s.id, s.account_id]));
  const allPeriods = [...new Set(sales.map((s) => s.period.slice(0, 10)))].sort();

  const { data: items } = await supabase
    .from("monthly_sales_items")
    .select("monthly_sale_id, codigo, producto_nombre, cantidad, total");

  const nombreByCodigo = new Map<string, string>();
  const codigosByAccount = new Map<string, Set<string>>();
  // Para top productos por cuenta: account → codigo → { nombre, cantidad, total }
  const itemsByAccount = new Map<string, Map<string, { nombre: string; cantidad: number; total: number }>>();

  for (const it of (items ?? []) as ItemRow[]) {
    const codigo = it.codigo?.trim();
    if (!codigo) continue;
    const account = saleToAccount.get(it.monthly_sale_id);
    if (!account) continue;
    if (!nombreByCodigo.has(codigo)) nombreByCodigo.set(codigo, it.producto_nombre || codigo);
    (codigosByAccount.get(account) ?? codigosByAccount.set(account, new Set()).get(account)!).add(codigo);
    const acc = itemsByAccount.get(account) ?? itemsByAccount.set(account, new Map()).get(account)!;
    const prev = acc.get(codigo) ?? { nombre: it.producto_nombre || codigo, cantidad: 0, total: 0 };
    prev.cantidad += Number(it.cantidad ?? 0);
    prev.total += Number(it.total ?? 0);
    acc.set(codigo, prev);
  }

  return { sales, allPeriods, nombreByCodigo, codigosByAccount, itemsByAccount };
}

/** Serie mensual de una cuenta + churn. */
export async function loadAccountChurn(supabase: DbClient, accountId: string): Promise<ChurnResult> {
  const { data: ms } = await supabase.from("monthly_sales").select("account_id, period, venta_bruta");
  const sales = (ms ?? []) as MsRow[];
  const allPeriods = [...new Set(sales.map((s) => s.period.slice(0, 10)))].sort();
  const series = sales
    .filter((s) => s.account_id === accountId)
    .map((s) => ({ period: s.period, amount: Number(s.venta_bruta ?? 0) }));
  return computeChurn(series, allPeriods);
}

/** Recomendaciones de cross-sell para una cuenta. */
export async function loadCrossSell(supabase: DbClient, accountId: string): Promise<Recommendation[]> {
  const { codigosByAccount, nombreByCodigo } = await loadSalesUniverse(supabase);
  const { data: accts } = await supabase.from("accounts").select("id, account_type, region");
  const meta = new Map((accts ?? []).map((a) => [a.id, a]));

  const baskets: AccountBasket[] = [...codigosByAccount.entries()].map(([id, codigos]) => ({
    account_id: id,
    account_type: meta.get(id)?.account_type ?? null,
    region: meta.get(id)?.region ?? null,
    codigos,
  }));

  return recommendForAccount(accountId, baskets, nombreByCodigo);
}

export type AccountFacts = {
  churn: ChurnResult;
  trend: { period: string; amount: number }[];
  topProducts: { nombre: string; cantidad: number; total: number }[];
  recommendations: Recommendation[];
  cartera: { saldo_pendiente: number; saldo_vencido: number; dias_vencido: number };
};

/** Todos los hechos de una cuenta para el resumen Next Best Action. */
export async function loadAccountFacts(supabase: DbClient, accountId: string): Promise<AccountFacts> {
  const universe = await loadSalesUniverse(supabase);
  const { sales, allPeriods, nombreByCodigo, codigosByAccount, itemsByAccount } = universe;

  const series = sales
    .filter((s) => s.account_id === accountId)
    .map((s) => ({ period: s.period.slice(0, 10), amount: Number(s.venta_bruta ?? 0) }))
    .sort((a, b) => a.period.localeCompare(b.period));
  const churn = computeChurn(series, allPeriods);

  const topProducts = [...(itemsByAccount.get(accountId)?.values() ?? [])]
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  const { data: accts } = await supabase.from("accounts").select("id, account_type, region");
  const meta = new Map((accts ?? []).map((a) => [a.id, a]));
  const baskets: AccountBasket[] = [...codigosByAccount.entries()].map(([id, codigos]) => ({
    account_id: id,
    account_type: meta.get(id)?.account_type ?? null,
    region: meta.get(id)?.region ?? null,
    codigos,
  }));
  const recommendations = recommendForAccount(accountId, baskets, nombreByCodigo);

  const { data: bal } = await supabase
    .from("v_account_balance")
    .select("saldo_pendiente, saldo_vencido, dias_vencido")
    .eq("account_id", accountId)
    .maybeSingle();

  return {
    churn,
    trend: series,
    topProducts,
    recommendations,
    cartera: {
      saldo_pendiente: Number(bal?.saldo_pendiente ?? 0),
      saldo_vencido: Number(bal?.saldo_vencido ?? 0),
      dias_vencido: Number(bal?.dias_vencido ?? 0),
    },
  };
}

export type ChurnRow = { account_id: string; business_name: string; assigned_rep_id: string | null; churn: ChurnResult };

/** Ranking de churn de todas las cuentas (para el dashboard "Dejaron de pedir"). */
export async function loadChurnRanking(supabase: DbClient): Promise<ChurnRow[]> {
  const { data: ms } = await supabase.from("monthly_sales").select("account_id, period, venta_bruta");
  const sales = (ms ?? []) as MsRow[];
  const allPeriods = [...new Set(sales.map((s) => s.period.slice(0, 10)))].sort();

  const byAccount = new Map<string, { period: string; amount: number }[]>();
  for (const s of sales) {
    (byAccount.get(s.account_id) ?? byAccount.set(s.account_id, []).get(s.account_id)!).push({
      period: s.period,
      amount: Number(s.venta_bruta ?? 0),
    });
  }

  const ids = [...byAccount.keys()];
  const { data: accts } = await supabase
    .from("accounts")
    .select("id, business_name, assigned_rep_id, status")
    .in("id", ids.length ? ids : ["-"]);
  const meta = new Map((accts ?? []).map((a) => [a.id, a]));

  const rows: ChurnRow[] = [];
  for (const [account_id, series] of byAccount) {
    const m = meta.get(account_id);
    // Solo cuentas activas (el churn de prospectos/perdidos no es accionable).
    if (m && m.status && !["activo", "prospecto"].includes(m.status)) continue;
    const churn = computeChurn(series, allPeriods);
    if (churn.status === "cayo" || churn.status === "sin_facturacion" || churn.status === "en_riesgo") {
      rows.push({ account_id, business_name: m?.business_name ?? "(sin nombre)", assigned_rep_id: m?.assigned_rep_id ?? null, churn });
    }
  }
  return rows.sort((a, b) => CHURN_RANK[a.churn.status] - CHURN_RANK[b.churn.status] || b.churn.dropPct - a.churn.dropPct);
}
