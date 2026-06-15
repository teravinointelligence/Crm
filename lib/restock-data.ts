// Carga los insumos del modelo de reabasto: cruza productos (stock + lead time)
// con la velocidad de venta (vista v_product_sales_velocity). SERVER-ONLY.
// La vista respeta RLS (lectura admin/contador), así que esto se usa en
// pantallas de cobranza/restock admin.

import "server-only";
import type { createClient } from "@/lib/supabase/server";
import { buildRestockSuggestions, computeReorder, type ReorderInput, type ReorderResult } from "@/lib/restock";

type DbClient = ReturnType<typeof createClient>;

export async function loadReorderInputs(supabase: DbClient): Promise<ReorderInput[]> {
  const [{ data: products }, { data: velocity }] = await Promise.all([
    supabase
      .from("products")
      .select("id, sku, name, supplier, stock_quantity, lead_time_days, codigo_contpaqi")
      .eq("active", true),
    // La vista expone `sku` que en realidad es el codigo de CONTPAQ (alias).
    supabase.from("v_product_sales_velocity").select("sku, units_per_month"),
  ]);

  // Velocidad indexada por codigo de CONTPAQ.
  const velByCodigo = new Map<string, number>();
  for (const v of (velocity ?? []) as { sku: string | null; units_per_month: number | null }[]) {
    if (v.sku) velByCodigo.set(String(v.sku).trim(), Number(v.units_per_month ?? 0));
  }

  // Se cruza por codigo_contpaqi (el puente catálogo ↔ ventas). Sin ese mapeo
  // (Catálogo → Mapear códigos CONTPAQ) el producto no tiene velocidad y no
  // genera sugerencia, por diseño.
  return (products ?? []).map((p) => ({
    product_id: p.id,
    sku: p.sku,
    name: p.name,
    supplier: p.supplier,
    stock: p.stock_quantity,
    velocityPerMonth: p.codigo_contpaqi ? velByCodigo.get(String(p.codigo_contpaqi).trim()) ?? 0 : 0,
    leadDays: p.lead_time_days,
  }));
}

/** Todas las sugerencias de reabasto (productos en riesgo), ordenadas. */
export async function getRestockSuggestions(supabase: DbClient): Promise<ReorderResult[]> {
  const inputs = await loadReorderInputs(supabase);
  return buildRestockSuggestions(inputs);
}

/** Solo los IDs en riesgo (para badges del catálogo / conteo del dashboard). */
export async function getAtRiskProductIds(supabase: DbClient): Promise<Set<string>> {
  const inputs = await loadReorderInputs(supabase);
  const ids = new Set<string>();
  for (const i of inputs) {
    if (computeReorder(i).atRisk) ids.add(i.product_id);
  }
  return ids;
}
