// Rastreo por producto (server-only): para un producto del catálogo, ¿qué
// clientes lo compran? Se arma desde monthly_sales_items (renglones del reporte
// de Ventas de CONTPAQi) cruzando su `codigo` con el SKU / código CONTPAQ del
// producto. Sin migración: usa tablas existentes. RLS hace el resto — un
// vendedor solo ve compras de SUS cuentas; admin/finanzas ven todas.

import "server-only";
import type { createClient } from "@/lib/supabase/server";

type DbClient = ReturnType<typeof createClient>;

export type ProductCustomerRow = {
  account_id: string | null;
  cliente: string;
  vendedor: string | null;
  unidades: number;
  importe: number;
  primera: string; // periodo (YYYY-MM-DD, día 1 del mes)
  ultima: string;
  meses: number; // meses distintos con compra
};

type ItemRow = {
  monthly_sale_id: string;
  cantidad: number | null;
  total: number | null;
};
type SaleRow = {
  id: string;
  account_id: string | null;
  sales_rep_id: string | null;
  period: string;
};

/**
 * Clientes que han comprado un producto, agregados por cuenta y ordenados por
 * importe (mayor primero). El producto se identifica por su código CONTPAQ o su
 * SKU, que es lo que traen los renglones de Ventas.
 */
export async function loadProductCustomers(
  supabase: DbClient,
  product: { codigo_contpaqi: string | null; sku: string | null },
): Promise<ProductCustomerRow[]> {
  const codes = [product.codigo_contpaqi, product.sku]
    .map((c) => c?.trim())
    .filter((c): c is string => !!c);
  if (!codes.length) return [];

  const { data: itemsRaw } = await supabase
    .from("monthly_sales_items")
    .select("monthly_sale_id, cantidad, total")
    .in("codigo", codes);
  const items = (itemsRaw ?? []) as ItemRow[];
  if (!items.length) return [];

  const saleIds = [...new Set(items.map((i) => i.monthly_sale_id))];
  const saleById = new Map<string, SaleRow>();
  for (let i = 0; i < saleIds.length; i += 300) {
    const { data } = await supabase
      .from("monthly_sales")
      .select("id, account_id, sales_rep_id, period")
      .in("id", saleIds.slice(i, i + 300));
    for (const s of (data ?? []) as SaleRow[]) saleById.set(s.id, s);
  }

  // Agrega por cuenta. Los renglones cuya venta quedó fuera por RLS (no son del
  // vendedor) no aparecen en saleById y se omiten solos.
  type Agg = {
    account_id: string | null;
    rep_id: string | null;
    unidades: number;
    importe: number;
    periods: Set<string>;
  };
  const byAccount = new Map<string, Agg>();
  for (const it of items) {
    const sale = saleById.get(it.monthly_sale_id);
    if (!sale?.account_id) continue;
    const key = sale.account_id;
    const agg =
      byAccount.get(key) ??
      byAccount
        .set(key, {
          account_id: sale.account_id,
          rep_id: sale.sales_rep_id,
          unidades: 0,
          importe: 0,
          periods: new Set<string>(),
        })
        .get(key)!;
    agg.unidades += Number(it.cantidad ?? 0);
    agg.importe += Number(it.total ?? 0);
    agg.periods.add(sale.period.slice(0, 10));
  }
  if (!byAccount.size) return [];

  // Resuelve nombres de cuenta y vendedor en lote.
  const accountIds = [...byAccount.keys()];
  const repIds = [
    ...new Set(
      [...byAccount.values()].map((a) => a.rep_id).filter((r): r is string => !!r),
    ),
  ];
  const accountName = new Map<string, string>();
  for (let i = 0; i < accountIds.length; i += 300) {
    const { data } = await supabase
      .from("accounts")
      .select("id, business_name")
      .in("id", accountIds.slice(i, i + 300));
    for (const a of (data ?? []) as { id: string; business_name: string | null }[]) {
      accountName.set(a.id, a.business_name ?? "—");
    }
  }
  const repName = new Map<string, string>();
  if (repIds.length) {
    const { data } = await supabase
      .from("sales_reps")
      .select("id, full_name")
      .in("id", repIds);
    for (const r of (data ?? []) as { id: string; full_name: string | null }[]) {
      repName.set(r.id, r.full_name ?? "—");
    }
  }

  const rows: ProductCustomerRow[] = [...byAccount.values()].map((a) => {
    const periods = [...a.periods].sort();
    return {
      account_id: a.account_id,
      cliente: a.account_id ? accountName.get(a.account_id) ?? "—" : "—",
      vendedor: a.rep_id ? repName.get(a.rep_id) ?? null : null,
      unidades: a.unidades,
      importe: a.importe,
      primera: periods[0],
      ultima: periods[periods.length - 1],
      meses: periods.length,
    };
  });
  rows.sort((x, y) => y.importe - x.importe);
  return rows;
}
