import { createClient } from "@/lib/supabase/server";
import { getCurrentRep } from "@/lib/auth";
import { getAtRiskProductIds } from "@/lib/restock-data";
import { ProductsListClient } from "@/components/products/ProductsListClient";

export const metadata = { title: "Catálogo — TERAVINO CRM" };

export default async function CatalogoPage() {
  const supabase = createClient();
  const rep = await getCurrentRep();
  const isAdmin = rep?.role === "admin";

  const [{ data }, { data: warehouseRows }] = await Promise.all([
    supabase.from("products").select("*").order("supplier").order("name"),
    supabase
      .from("product_warehouse_stock")
      .select("product_id, warehouse, stock_quantity, last_update"),
  ]);

  // product_id → { almacén: existencia } para el desglose en la tabla
  const warehouseStock: Record<string, Record<string, number>> = {};
  // almacén → última fecha de actualización del inventario (la más reciente)
  const warehouseUpdated: Record<string, string> = {};
  for (const r of warehouseRows ?? []) {
    (warehouseStock[r.product_id] ??= {})[r.warehouse] = r.stock_quantity;
    if (r.last_update && (!warehouseUpdated[r.warehouse] || r.last_update > warehouseUpdated[r.warehouse])) {
      warehouseUpdated[r.warehouse] = r.last_update;
    }
  }

  // Productos en riesgo de quiebre (modelo de reabasto). Solo admin: la vista de
  // velocidad respeta RLS (lectura de ventas admin/contador).
  const riskIds = isAdmin ? [...(await getAtRiskProductIds(supabase))] : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl">Catálogo</h1>
        <p className="text-sm text-muted-foreground">
          Vinos y destilados de TERAVINO. Los precios mostrados son antes de IVA.
        </p>
      </div>
      <ProductsListClient
        products={data ?? []}
        warehouseStock={warehouseStock}
        warehouseUpdated={warehouseUpdated}
        riskIds={riskIds}
        isAdmin={!!isAdmin}
        canRequestTransfer={rep?.role === "admin" || rep?.role === "rep"}
      />
    </div>
  );
}
