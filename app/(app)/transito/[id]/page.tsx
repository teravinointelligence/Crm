import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PurchaseOrderActions } from "@/components/transito/PurchaseOrderActions";
import { DocumentLink } from "@/components/transito/DocumentLink";
import { formatCurrency, formatDate } from "@/lib/utils";

export default async function PODetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const admin = await isAdmin();
  const { data: po } = await supabase
    .from("purchase_orders")
    .select("*, purchase_order_items(*)")
    .eq("id", params.id)
    .single();
  if (!po) notFound();
  const items = (po.purchase_order_items ?? []) as Array<{
    id: string; product_name: string; quantity_ordered: number; quantity_received: number | null; unit_cost: number | null; line_total: number | null; destination_region: string | null;
  }>;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Button asChild variant="ghost" size="sm"><Link href="/transito"><ArrowLeft className="mr-1 h-4 w-4" /> Tránsito</Link></Button>

      <div className="rounded-lg border bg-card p-6 brand-shadow space-y-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="font-display text-3xl">{po.po_number}</h1>
          <div className="flex gap-2"><Badge variant="muted">{po.status}</Badge><Badge variant="accent">{po.payment_status}</Badge></div>
        </div>
        <p className="text-sm text-muted-foreground">
          {po.supplier} · OC {formatDate(po.order_date)}{po.expected_arrival_date ? ` · ETA ${formatDate(po.expected_arrival_date)}` : ""}
        </p>
        {po.supplier_invoice_number && (
          <p className="text-sm text-muted-foreground">
            Factura proveedor: {po.supplier_invoice_number}
            {po.supplier_invoice_date ? ` · emitida ${formatDate(po.supplier_invoice_date)}` : ""}
            {po.supplier_invoice_due_date ? ` · vence ${formatDate(po.supplier_invoice_due_date)}` : ""}
          </p>
        )}
        {(po.shipping_carrier || po.tracking_number) && (
          <p className="text-sm text-muted-foreground">Embarque: {[po.shipping_carrier, po.tracking_number].filter(Boolean).join(" · ")}</p>
        )}
        {admin && (po.oc_file_url || po.supplier_invoice_pdf_url) && (
          <div className="flex flex-wrap items-center gap-4 pt-2">
            {po.oc_file_url && <DocumentLink path={po.oc_file_url} label="OC (Excel)" />}
            {po.supplier_invoice_pdf_url && <DocumentLink path={po.supplier_invoice_pdf_url} label="Factura del proveedor (PDF)" />}
          </div>
        )}
      </div>

      <Card><CardContent className="p-0">
        <table className="min-w-full text-sm">
          <thead className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground"><tr><th className="px-4 py-3">Producto</th><th className="px-4 py-3">Destino</th><th className="px-4 py-3 text-right">Pedido</th><th className="px-4 py-3 text-right">Recibido</th><th className="px-4 py-3 text-right">Costo</th><th className="px-4 py-3 text-right">Total</th></tr></thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id} className="border-b last:border-b-0">
                <td className="px-4 py-3 font-medium">{i.product_name}</td>
                <td className="px-4 py-3 text-muted-foreground">{i.destination_region ?? "—"}</td>
                <td className="px-4 py-3 text-right">{i.quantity_ordered}</td>
                <td className="px-4 py-3 text-right text-muted-foreground">{i.quantity_received ?? 0}</td>
                <td className="px-4 py-3 text-right text-muted-foreground">{formatCurrency(i.unit_cost)}</td>
                <td className="px-4 py-3 text-right font-medium">{formatCurrency(i.line_total)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-muted/30">
            <tr><td colSpan={5} className="px-4 py-2 text-right text-muted-foreground">Subtotal</td><td className="px-4 py-2 text-right">{formatCurrency(po.subtotal)}</td></tr>
            <tr><td colSpan={5} className="px-4 py-2 text-right text-muted-foreground">IVA</td><td className="px-4 py-2 text-right">{formatCurrency(po.iva)}</td></tr>
            <tr className="border-t"><td colSpan={5} className="px-4 py-3 text-right font-display text-lg">Total</td><td className="px-4 py-3 text-right font-display text-lg text-brand-carmesi">{formatCurrency(po.total)}</td></tr>
          </tfoot>
        </table>
      </CardContent></Card>

      {(po.status === "recibida" || po.status === "recibida_parcial") && (
        <div className="rounded-md border bg-amber-50 p-4 text-sm text-amber-900">
          Esta OC fue recibida — recuerda actualizar el stock desde CONTPAQi subiendo <code>plantilla_stock</code> en Catálogo → Importar.
        </div>
      )}

      {admin && <PurchaseOrderActions poId={po.id} status={po.status ?? "borrador"} items={items} />}
    </div>
  );
}
