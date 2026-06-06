import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, PackagePlus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Consolidables — TERAVINO CRM" };

type ItemRow = {
  request_id: string;
  product_id: string | null;
  product_name: string;
  supplier: string | null;
  quantity_approved: number | null;
  quantity_requested: number;
};

type RequestRow = {
  id: string;
  request_number: string;
  region_destino: string | null;
  created_at: string | null;
  sales_reps: { full_name: string | null } | null;
};

export default async function ConsolidablesPage() {
  if (!(await isAdmin())) redirect("/restock");
  const supabase = createClient();

  const { data: reqs } = await supabase
    .from("restock_requests")
    .select(
      "id, request_number, region_destino, created_at, sales_reps:sales_rep_id(full_name)",
    )
    .eq("status", "aprobada")
    .order("created_at", { ascending: true });
  const requests = (reqs ?? []) as unknown as RequestRow[];

  if (!requests.length) {
    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <Button asChild variant="ghost" size="sm">
          <Link href="/restock">
            <ArrowLeft className="mr-1 h-4 w-4" /> Restock
          </Link>
        </Button>
        <h1 className="font-display text-2xl sm:text-3xl">Restocks consolidables por proveedor</h1>
        <EmptyState
          icon={PackagePlus}
          title="Sin restocks aprobados pendientes"
          description="Cuando apruebes pedidos de restock aparecerán aquí agrupados por proveedor para consolidarlos en una OC."
        />
      </div>
    );
  }

  const ids = requests.map((r) => r.id);
  const { data: itemsData } = await supabase
    .from("restock_request_items")
    .select(
      "request_id, product_id, product_name, supplier, quantity_approved, quantity_requested",
    )
    .in("request_id", ids);
  const items = (itemsData ?? []) as ItemRow[];

  const reqById = new Map(requests.map((r) => [r.id, r]));

  type Aggregated = {
    product_key: string;
    product_name: string;
    total_qty: number;
    sources: Array<{ request_id: string; qty: number }>;
  };
  type SupplierGroup = {
    supplier: string;
    request_ids: Set<string>;
    products: Map<string, Aggregated>;
  };
  const groups = new Map<string, SupplierGroup>();
  for (const it of items) {
    const supplier = it.supplier?.trim() || "Sin proveedor";
    const qty = Number(it.quantity_approved ?? it.quantity_requested ?? 0);
    if (qty <= 0) continue;
    let g = groups.get(supplier);
    if (!g) {
      g = { supplier, request_ids: new Set(), products: new Map() };
      groups.set(supplier, g);
    }
    g.request_ids.add(it.request_id);
    const key = it.product_id ?? `name:${it.product_name}`;
    const prev = g.products.get(key);
    if (prev) {
      prev.total_qty += qty;
      prev.sources.push({ request_id: it.request_id, qty });
    } else {
      g.products.set(key, {
        product_key: key,
        product_name: it.product_name,
        total_qty: qty,
        sources: [{ request_id: it.request_id, qty }],
      });
    }
  }

  const supplierGroups = [...groups.values()].sort((a, b) =>
    a.supplier.localeCompare(b.supplier),
  );

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href="/restock">
          <ArrowLeft className="mr-1 h-4 w-4" /> Restock
        </Link>
      </Button>

      <div>
        <h1 className="font-display text-2xl sm:text-3xl">Restocks consolidables por proveedor</h1>
        <p className="text-sm text-muted-foreground">
          Agrupa los pedidos de restock aprobados por proveedor para generar una sola OC.
        </p>
      </div>

      <div className="space-y-6">
        {supplierGroups.map((g) => {
          const reqIds = [...g.request_ids];
          const products = [...g.products.values()].sort((a, b) =>
            a.product_name.localeCompare(b.product_name),
          );
          const totalUnits = products.reduce((s, p) => s + p.total_qty, 0);
          const consolidableUrl = `/transito/nueva?from=${reqIds.join(
            ",",
          )}&supplier=${encodeURIComponent(g.supplier)}`;
          return (
            <Card key={g.supplier}>
              <CardContent className="space-y-4 p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="font-display text-xl">{g.supplier}</h2>
                    <p className="text-xs text-muted-foreground">
                      {products.length} productos · {totalUnits} unidades ·{" "}
                      {reqIds.length} pedido(s) de restock
                    </p>
                  </div>
                  {g.supplier !== "Sin proveedor" && (
                    <Button asChild>
                      <Link href={consolidableUrl}>
                        <PackagePlus className="mr-1 h-4 w-4" /> Generar OC consolidada
                      </Link>
                    </Button>
                  )}
                </div>

                <div className="overflow-x-auto rounded-md border">
                  <table className="min-w-full text-sm">
                    <thead className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2">Producto</th>
                        <th className="px-3 py-2 text-right">Total</th>
                        <th className="px-3 py-2">Origen</th>
                      </tr>
                    </thead>
                    <tbody>
                      {products.map((p) => (
                        <tr key={p.product_key} className="border-b last:border-b-0">
                          <td className="px-3 py-2 font-medium">{p.product_name}</td>
                          <td className="px-3 py-2 text-right">{p.total_qty}</td>
                          <td className="px-3 py-2 text-xs text-muted-foreground">
                            {p.sources
                              .map((s) => {
                                const r = reqById.get(s.request_id);
                                const rep = r?.sales_reps?.full_name ?? "—";
                                return `${rep} (${r?.request_number ?? "?"}): ${s.qty}`;
                              })
                              .join(" · ")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex flex-wrap gap-1">
                  {reqIds.map((id) => {
                    const r = reqById.get(id);
                    if (!r) return null;
                    return (
                      <Link key={id} href={`/restock/${id}`}>
                        <Badge variant="muted" className="hover:bg-accent/30">
                          {r.request_number} · {r.sales_reps?.full_name ?? "—"}
                          {r.region_destino ? ` · ${r.region_destino}` : ""}
                          {r.created_at ? ` · ${formatDate(r.created_at)}` : ""}
                        </Badge>
                      </Link>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
