import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRep } from "@/lib/auth";
import { RestockRequestForm } from "@/components/restock/RestockRequestForm";
import type { WarehouseStock } from "@/lib/warehouses";

export const metadata = { title: "Nuevo restock — TERAVINO CRM" };

export default async function NuevoRestockPage() {
  const supabase = createClient();
  const rep = await getCurrentRep();
  if (!rep) redirect("/login");
  const [{ data: products }, { data: warehouseStock }] = await Promise.all([
    supabase.from("products").select("*").eq("active", true).order("supplier").order("name"),
    supabase.from("product_warehouse_stock").select("product_id, warehouse, stock_quantity, last_update, last_source"),
  ]);
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <h1 className="font-display text-3xl">Nuevo pedido de restock</h1>
      <RestockRequestForm
        products={products ?? []}
        repId={rep.id}
        defaultRegion={rep.primary_region}
        warehouseStock={(warehouseStock ?? []) as WarehouseStock[]}
      />
    </div>
  );
}
