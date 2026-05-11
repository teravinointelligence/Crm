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
          <Badge variant="muted">{r.status}</Badge>
        </div>
        {r.notes && <p className="mt-4 border-t pt-4 text-sm">{r.notes}</p>}
        {r.review_notes && (
          <p className="mt-2 rounded-md bg-accent/15 p-3 text-sm">
            <strong>Revisión{r.reviewer?.full_name ? ` (${r.reviewer.full_name})` : ""}:</strong> {r.review_notes}
          </p>
        )}
      </div>

      <Card><CardContent className="p-0">
        <table className="min-w-full text-sm">
          <thead className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground"><tr><th className="px-4 py-3">Producto</th><th className="px-4 py-3">Proveedor</th><th className="px-4 py-3 text-right">Pedido</th><th className="px-4 py-3 text-right">Aprobado</th><th className="px-4 py-3">Nota</th></tr></thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id} className="border-b last:border-b-0">
                <td className="px-4 py-3 font-medium">{i.product_name}</td>
                <td className="px-4 py-3 text-muted-foreground">{i.supplier ?? "—"}</td>
                <td className="px-4 py-3 text-right">{i.quantity_requested}</td>
                <td className="px-4 py-3 text-right">{i.quantity_approved ?? "—"}</td>
                <td className="px-4 py-3 text-muted-foreground">{i.notes ?? "—"}</td>
              </tr>
            ))}
          </tbody>
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
