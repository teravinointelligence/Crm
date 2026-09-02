import "server-only";
import type { createClient } from "@/lib/supabase/server";
import { computeReorder } from "@/lib/restock";
import { classifyRestock, inventoryAgeDays, type RestockVerdict } from "@/lib/restock-review-rules";
import { warehouseForRegion, type Warehouse } from "@/lib/warehouses";

type DbClient = ReturnType<typeof createClient>;
export type RestockReviewInput = { id: string; product_id: string | null; product_name: string; quantity_requested: number };
export type RestockEvaluation = {
  itemId: string; productId: string | null; productName: string; warehouse: Warehouse | null;
  requested: number; stock: number | null; inventoryDate: string | null; inventorySource: string | null;
  salesPerMonth: number | null; currentCoverDays: number | null; projectedCoverDays: number | null;
  suggestedQty: number | null; verdict: RestockVerdict; reason: string;
};

export async function evaluateRestockRequest(input: { supabase: DbClient; salesRepId: string; region: string | null; fulfillment: string | null; items: RestockReviewInput[] }): Promise<RestockEvaluation[]> {
  const productIds = input.items.map((item) => item.product_id).filter((id): id is string => Boolean(id));
  const warehouse = input.fulfillment === "almacen" ? "Los Cabos" : warehouseForRegion(input.region);
  const since = new Date();
  since.setUTCMonth(since.getUTCMonth() - 3, 1);
  const [{ data: products }, { data: stockRows }, { data: sales }] = await Promise.all([
    productIds.length ? input.supabase.from("products").select("id, sku, name, supplier, codigo_contpaqi, lead_time_days").in("id", productIds) : Promise.resolve({ data: [] }),
    productIds.length && warehouse ? input.supabase.from("product_warehouse_stock").select("product_id, stock_quantity, last_update, last_source").eq("warehouse", warehouse).in("product_id", productIds) : Promise.resolve({ data: [] }),
    input.supabase.from("monthly_sales").select("id").eq("sales_rep_id", input.salesRepId).gte("period", since.toISOString().slice(0, 10)),
  ]);
  const saleIds = (sales ?? []).map((row) => row.id);
  const codes = (products ?? []).map((product) => product.codigo_contpaqi).filter((code): code is string => Boolean(code));
  const { data: soldItems } = saleIds.length && codes.length ? await input.supabase.from("monthly_sales_items").select("codigo, cantidad").in("monthly_sale_id", saleIds).in("codigo", codes) : { data: [] };
  const productById = new Map((products ?? []).map((product) => [product.id, product]));
  const stockByProduct = new Map((stockRows ?? []).map((row) => [row.product_id, row]));
  const salesByCode = new Map<string, number>();
  for (const row of soldItems ?? []) if (row.codigo) salesByCode.set(row.codigo, (salesByCode.get(row.codigo) ?? 0) + Number(row.cantidad ?? 0));

  return input.items.map((item) => {
    const product = item.product_id ? productById.get(item.product_id) : null;
    const stockRow = item.product_id ? stockByProduct.get(item.product_id) : null;
    const code = product?.codigo_contpaqi ?? null;
    const ageDays = inventoryAgeDays(stockRow?.last_update ?? null);
    if (!warehouse || !product || !code || !stockRow || ageDays == null || ageDays > 7) return {
      itemId: item.id, productId: item.product_id, productName: item.product_name, warehouse, requested: Number(item.quantity_requested),
      stock: stockRow ? Number(stockRow.stock_quantity) : null, inventoryDate: stockRow?.last_update ?? null, inventorySource: stockRow?.last_source ?? null,
      salesPerMonth: null, currentCoverDays: null, projectedCoverDays: null, suggestedQty: null, verdict: "datos_insuficientes",
      reason: !code
        ? "Falta vincular el codigo CONTPAQ del producto."
        : ageDays != null && ageDays > 7
          ? `El inventario tiene ${ageDays} dias; actualiza la carga desde Drive antes de aprobar.`
          : "No hay inventario vigente para el almacen destino.",
    };
    const stock = Number(stockRow.stock_quantity ?? 0);
    const salesPerMonth = (salesByCode.get(code) ?? 0) / 3;
    const result = computeReorder({ product_id: product.id, sku: product.sku, name: product.name, supplier: product.supplier, stock, velocityPerMonth: salesPerMonth, leadDays: product.lead_time_days });
    const requested = Number(item.quantity_requested);
    const projectedCoverDays = result.velocityPerDay > 0 ? (stock + requested) / result.velocityPerDay : null;
    const { verdict, reason } = classifyRestock({ requested, salesPerMonth, suggestedQty: result.suggestedQty });
    return { itemId: item.id, productId: item.product_id, productName: item.product_name, warehouse, requested, stock, inventoryDate: stockRow.last_update, inventorySource: stockRow.last_source, salesPerMonth: Math.round(salesPerMonth * 10) / 10, currentCoverDays: result.daysOfCover == null ? null : Math.round(result.daysOfCover), projectedCoverDays: projectedCoverDays == null ? null : Math.round(projectedCoverDays), suggestedQty: result.suggestedQty, verdict, reason };
  });
}
