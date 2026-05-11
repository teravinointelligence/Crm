import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/auth";
import { PurchaseOrderForm, type InitialLine } from "@/components/transito/PurchaseOrderForm";

export const metadata = { title: "Nueva OC — TERAVINO CRM" };

export default async function NuevaOCPage({
  searchParams,
}: {
  searchParams: { from?: string; supplier?: string };
}) {
  if (!(await isAdmin())) redirect("/transito");
  const supabase = createClient();
  const { data: products } = await supabase
    .from("products")
    .select("*")
    .order("supplier")
    .order("name");

  const sourceIds = searchParams.from
    ? searchParams.from.split(",").filter(Boolean)
    : undefined;

  let initialSupplier = searchParams.supplier ?? undefined;
  let initialLines: InitialLine[] | undefined;

  if (sourceIds?.length) {
    const { data: items } = await supabase
      .from("restock_request_items")
      .select("product_id, product_name, supplier, quantity_approved, quantity_requested, request_id")
      .in("request_id", sourceIds);
    const filtered = (items ?? []).filter(
      (i) => !initialSupplier || i.supplier === initialSupplier,
    );
    if (!initialSupplier && filtered.length) {
      const counts = new Map<string, number>();
      for (const i of filtered)
        if (i.supplier) counts.set(i.supplier, (counts.get(i.supplier) ?? 0) + 1);
      initialSupplier = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    }
    const agg = new Map<string, InitialLine>();
    for (const i of filtered) {
      if (initialSupplier && i.supplier !== initialSupplier) continue;
      const key = i.product_id ?? `name:${i.product_name}`;
      const qty = Number(i.quantity_approved ?? i.quantity_requested ?? 0);
      const existing = agg.get(key);
      if (existing) existing.qty += qty;
      else
        agg.set(key, {
          product_id: i.product_id,
          product_name: i.product_name,
          qty,
        });
    }
    initialLines = [...agg.values()].filter((l) => l.qty > 0);
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <h1 className="font-display text-3xl">Nueva orden de compra</h1>
      {sourceIds?.length ? (
        <p className="rounded-md border bg-accent/10 p-3 text-sm">
          Consolidando {sourceIds.length} pedido(s) de restock
          {initialSupplier ? ` de ${initialSupplier}` : ""}. Ajusta cantidades y
          costos antes de crear la OC.
        </p>
      ) : null}
      <PurchaseOrderForm
        products={products ?? []}
        sourceRequestIds={sourceIds}
        initialSupplier={initialSupplier}
        initialLines={initialLines}
      />
    </div>
  );
}
