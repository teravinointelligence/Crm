import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRep } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RestockReviewActions } from "@/components/restock/RestockReviewActions";
import { formatDateTime } from "@/lib/utils";
import { FULFILLMENT_LABEL, FULFILLMENT_HINT, FULFILLMENT_VARIANT, type FulfillmentType } from "@/lib/restock-fulfillment";

export default async function RestockDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const rep = await getCurrentRep();
  const isAdmin = rep?.role === "admin";

  const { data: req } = await supabase
    .from("restock_requests")
    .select("*, sales_reps:sales_rep_id(full_name), reviewer:reviewed_by(full_name), restock_request_items(*)")
    .eq("id", params.id)
    .single();
  if (!req) notFound();

  const items = (req.restock_request_items ?? []) as Array<{
    id: string; product_name: string; supplier: string | null; quantity_requested: number; quantity_approved: number | null; notes: string | null;
  }>;
  const r = req as typeof req & { sales_reps: { full_name: string | null } | null; reviewer: { full_name: string | null } | null };

  // Agrupar items por proveedor (una OC por proveedor).
  const bySupplier = new Map<string, typeof items>();
  for (const i of items) {
    const key = i.supplier?.trim() || "Sin proveedor";
    const arr = bySupplier.get(key) ?? [];
    arr.push(i);
    bySupplier.set(key, arr);
  }
  const supplierGroups = Array.from(bySupplier.entries()).sort((a, b) => a[0].localeCompare(b[0]));

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Button asChild variant="ghost" size="sm"><Link href="/restock"><ArrowLeft className="mr-1 h-4 w-4" /> Restock</Link></Button>

      <div className="rounded-lg border bg-card p-6 brand-shadow">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="font-display text-3xl">{r.request_number}</h1>
            <p className="text-sm text-muted-foreground">
              {r.sales_reps?.full_name ?? "—"} · {r.region_destino ?? "sin región"} · {formatDateTime(r.created_at)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {r.fulfillment && (
              <Badge variant={FULFILLMENT_VARIANT[r.fulfillment as FulfillmentType] ?? "muted"}>
                {FULFILLMENT_LABEL[r.fulfillment as FulfillmentType] ?? r.fulfillment}
              </Badge>
            )}
            <Badge variant="muted">{r.status}</Badge>
          </div>
        </div>
        {r.fulfillment === "directo_proveedor" && (
          <p className="mt-3 rounded-md bg-accent/15 p-3 text-sm">
            {FULFILLMENT_HINT.directo_proveedor}
          </p>
        )}
        {r.notes && <p className="mt-4 border-t pt-4 text-sm">{r.notes}</p>}
        {r.review_notes && (
          <p className="mt-2 rounded-md bg-accent/15 p-3 text-sm">
            <strong>Revisión{r.reviewer?.full_name ? ` (${r.reviewer.full_name})` : ""}:</strong> {r.review_notes}
          </p>
        )}
      </div>

      <Card><CardContent className="p-0">
        <table className="min-w-full text-sm">
          <thead className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground"><tr><th className="px-4 py-3">Producto</th><th className="px-4 py-3 text-right">Pedido</th><th className="px-4 py-3 text-right">Aprobado</th><th className="px-4 py-3">Nota</th></tr></thead>
          {supplierGroups.map(([supplier, group]) => {
            const totalPedido = group.reduce((s, i) => s + Number(i.quantity_requested || 0), 0);
            return (
              <tbody key={supplier} className="border-b last:border-b-0">
                <tr className="bg-muted/30">
                  <td colSpan={4} className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-brand-carmesi">
                    {supplier} · {group.length} producto{group.length === 1 ? "" : "s"} · {totalPedido} btl
                  </td>
                </tr>
                {group.map((i) => (
                  <tr key={i.id} className="border-t">
                    <td className="px-4 py-3 font-medium">{i.product_name}</td>
                    <td className="px-4 py-3 text-right">{i.quantity_requested}</td>
                    <td className="px-4 py-3 text-right">{i.quantity_approved ?? "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{i.notes ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            );
          })}
        </table>
      </CardContent></Card>

      {isAdmin && r.status === "enviada" && rep && (
        <RestockReviewActions requestId={r.id} repId={rep.id} items={items} />
      )}

      {isAdmin && r.status === "aprobada" && (
        <Card><CardContent className="flex items-center justify-between gap-3 p-6">
          <p className="text-sm text-muted-foreground">Pedido aprobado — listo para generar la orden de compra al proveedor.</p>
          <Button asChild><Link href={`/transito/nueva?from=${r.id}`}>Generar OC al proveedor</Link></Button>
        </CardContent></Card>
      )}
    </div>
  );
}
