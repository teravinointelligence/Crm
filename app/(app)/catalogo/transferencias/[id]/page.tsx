// Detalle de una transferencia/traspaso entre almacenes con sus renglones.

import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRep } from "@/lib/auth";
import { formatDateTime } from "@/lib/utils";
import {
  TRANSFER_STATUS_LABEL,
  TRANSFER_STATUS_VARIANT,
  type TransferStatus,
  type TransferItem,
} from "@/lib/warehouse-transfers";

export const dynamic = "force-dynamic";

export default async function TransferDetailPage({ params }: { params: { id: string } }) {
  const rep = await getCurrentRep();
  if (!rep) redirect("/login");

  const supabase = createClient();
  const { data: t } = await supabase
    .from("warehouse_transfer_requests")
    .select("*, requester:requested_by(full_name), warehouse_transfer_items(id, product_id, product_label, quantity)")
    .eq("id", params.id)
    .maybeSingle();
  if (!t) notFound();

  const items = ((t.warehouse_transfer_items ?? []) as TransferItem[])
    .slice()
    .sort((a, b) => a.product_label.localeCompare(b.product_label));
  const totalBtl = items.reduce((s, i) => s + Number(i.quantity || 0), 0);
  const status = t.status as TransferStatus;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href="/catalogo/transferencias"><ArrowLeft className="mr-1 h-4 w-4" /> Transferencias</Link>
      </Button>

      <div className="rounded-lg border bg-card p-6 brand-shadow">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="font-display text-2xl">
              <span className="inline-flex items-center gap-2">
                {t.from_warehouse} <ArrowRight className="h-5 w-5 text-muted-foreground" /> {t.to_warehouse}
              </span>
            </h1>
            <p className="text-sm text-muted-foreground">
              {(t as { requester?: { full_name?: string } }).requester?.full_name ?? "—"} · {formatDateTime(t.created_at)} ·{" "}
              {items.length} producto{items.length === 1 ? "" : "s"} · {totalBtl} btl
            </p>
          </div>
          <Badge variant={TRANSFER_STATUS_VARIANT[status] ?? "muted"}>{TRANSFER_STATUS_LABEL[status] ?? status}</Badge>
        </div>
        {t.reason && <p className="mt-4 border-t pt-4 text-sm">{t.reason}</p>}
        {t.admin_notes && (
          <p className="mt-2 rounded-md bg-accent/15 p-3 text-sm"><strong>Nota admin:</strong> {t.admin_notes}</p>
        )}
      </div>

      <Card><CardContent className="p-0">
        <table className="min-w-full text-sm">
          <thead className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr><th className="px-4 py-3">Producto</th><th className="px-4 py-3 text-right">Cantidad</th></tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id} className="border-b last:border-b-0">
                <td className="px-4 py-3">
                  {i.product_id ? (
                    <Link href={`/catalogo/${i.product_id}`} className="font-medium hover:text-brand-carmesi">{i.product_label}</Link>
                  ) : (
                    <span className="font-medium">{i.product_label} <span className="text-xs text-amber-600">(sin vincular)</span></span>
                  )}
                </td>
                <td className="px-4 py-3 text-right font-medium">{i.quantity}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent></Card>
    </div>
  );
}
