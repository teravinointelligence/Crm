"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";

type Item = { id: string; product_name: string; quantity_ordered: number; quantity_received: number | null };

const RECEIVED_STATES = ["recibida", "recibida_parcial", "cancelada"];

function sanitizeFilename(n: string) {
  return n.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9.\-_]+/g, "_").slice(-80) || "factura.pdf";
}

export function PurchaseOrderActions({
  poId, status, items,
}: {
  poId: string; status: string; items: Item[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const [pending, startTransition] = useTransition();
  const [recv, setRecv] = useState<Record<string, number>>(Object.fromEntries(items.map((i) => [i.id, i.quantity_received ?? 0])));
  const [invOpen, setInvOpen] = useState(false);

  const setStatus = (next: string, extra?: Record<string, unknown>) => {
    startTransition(async () => {
      const { error } = await supabase.from("purchase_orders").update({ status: next, ...(extra ?? {}) }).eq("id", poId);
      if (error) { toast.error("No pudimos actualizar", { description: error.message }); return; }
      toast.success("OC actualizada");
      router.refresh();
    });
  };

  const saveInvoice = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const pdf = fd.get("inv_pdf");
    const hasPdf = pdf instanceof File && pdf.size > 0;
    startTransition(async () => {
      let pdfPath: string | null = null;
      if (hasPdf) {
        if ((pdf as File).size > 15 * 1024 * 1024) { toast.error("El PDF supera 15 MB"); return; }
        pdfPath = `factura/${poId}/${Date.now()}-${sanitizeFilename((pdf as File).name)}`;
        const { error: upErr } = await supabase.storage.from("documentos").upload(pdfPath, pdf as File, { upsert: true });
        if (upErr) { toast.error("No pude subir el PDF", { description: upErr.message }); return; }
      }
      const nextStatus = hasPdf
        ? (RECEIVED_STATES.includes(status) ? status : "en_transito")
        : (status === "borrador" || status === "enviada_proveedor" || status === "confirmada" ? "facturada" : status);
      const { error } = await supabase.from("purchase_orders").update({
        supplier_invoice_number: String(fd.get("inv_num") ?? "").trim() || null,
        supplier_invoice_date: (fd.get("inv_date") as string) || null,
        supplier_invoice_due_date: (fd.get("inv_due") as string) || null,
        ...(pdfPath ? { supplier_invoice_pdf_url: pdfPath } : {}),
        status: nextStatus,
      }).eq("id", poId);
      if (error) { toast.error("Error", { description: error.message }); return; }
      await supabase.rpc("refresh_po_payment_status", { p_po_id: poId });
      toast.success(hasPdf ? "Factura cargada — OC en tránsito" : "Factura del proveedor registrada");
      setInvOpen(false);
      router.refresh();
    });
  };

  const saveTracking = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setStatus("en_transito", { shipping_carrier: String(fd.get("carrier") ?? "").trim() || null, tracking_number: String(fd.get("tracking") ?? "").trim() || null });
  };

  const receive = () => {
    startTransition(async () => {
      let allComplete = true;
      for (const i of items) {
        const q = recv[i.id] ?? 0;
        if (q < i.quantity_ordered) allComplete = false;
        await supabase.from("purchase_order_items").update({ quantity_received: q }).eq("id", i.id);
      }
      await supabase.from("purchase_orders").update({ status: allComplete ? "recibida" : "recibida_parcial" }).eq("id", poId);
      toast.success(allComplete ? "OC recibida" : "Recepción parcial registrada", {
        description: "Recuerda actualizar el stock desde CONTPAQi (plantilla_stock).",
      });
      router.refresh();
    });
  };

  return (
    <Card><CardContent className="space-y-4 p-6">
      <h3 className="font-display text-lg">Acciones</h3>
      <div className="flex flex-wrap gap-2">
        {status === "borrador" && <Button size="sm" disabled={pending} onClick={() => setStatus("enviada_proveedor")}>Marcar enviada al proveedor</Button>}
        {status === "enviada_proveedor" && <Button size="sm" disabled={pending} onClick={() => setStatus("confirmada")}>Marcar confirmada</Button>}

        <Dialog open={invOpen} onOpenChange={setInvOpen}>
          <DialogTrigger asChild><Button size="sm" variant="outline">Cargar factura del proveedor</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Factura del proveedor</DialogTitle></DialogHeader>
            <form onSubmit={saveInvoice} className="grid gap-3">
              <div className="space-y-1.5"><Label htmlFor="inv_num">Folio</Label><Input id="inv_num" name="inv_num" required /></div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5"><Label htmlFor="inv_date">Fecha emisión</Label><Input id="inv_date" name="inv_date" type="date" /></div>
                <div className="space-y-1.5"><Label htmlFor="inv_due">Fecha vencimiento</Label><Input id="inv_due" name="inv_due" type="date" /></div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="inv_pdf">PDF de la factura</Label>
                <Input id="inv_pdf" name="inv_pdf" type="file" accept="application/pdf,.pdf" />
                <p className="text-xs text-muted-foreground">Al adjuntar el PDF de la factura, la OC pasa a <strong>en tránsito</strong>.</p>
              </div>
              <div className="flex justify-end"><Button type="submit" disabled={pending}>{pending ? "Guardando…" : "Guardar"}</Button></div>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog>
          <DialogTrigger asChild><Button size="sm" variant="outline">Datos de embarque</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Datos de embarque</DialogTitle></DialogHeader>
            <form onSubmit={saveTracking} className="grid gap-3">
              <div className="space-y-1.5"><Label htmlFor="carrier">Transportista</Label><Input id="carrier" name="carrier" /></div>
              <div className="space-y-1.5"><Label htmlFor="tracking"># de tracking</Label><Input id="tracking" name="tracking" /></div>
              <div className="flex justify-end"><Button type="submit" disabled={pending}>Marcar en tránsito</Button></div>
            </form>
          </DialogContent>
        </Dialog>

        {status !== "borrador" && status !== "cancelada" && (
          <Dialog>
            <DialogTrigger asChild><Button size="sm" variant="outline">Recibir</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Recibir producto</DialogTitle></DialogHeader>
              <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="border-b text-left text-xs uppercase text-muted-foreground"><tr><th className="py-2">Producto</th><th className="py-2 text-right">Pedido</th><th className="py-2 text-right w-28">Recibido</th></tr></thead>
                <tbody>
                  {items.map((i) => (
                    <tr key={i.id} className="border-b">
                      <td className="py-2">{i.product_name}</td>
                      <td className="py-2 text-right text-muted-foreground">{i.quantity_ordered}</td>
                      <td className="py-2 text-right"><Input type="number" min={0} value={recv[i.id] ?? 0} onChange={(e) => setRecv((p) => ({ ...p, [i.id]: Number(e.target.value) || 0 }))} className="h-8 text-right" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
              <p className="text-xs text-muted-foreground">Esto NO modifica el stock — actualízalo en CONTPAQi y vuelve a subir plantilla_stock.</p>
              <div className="flex justify-end"><Button onClick={receive} disabled={pending}>Confirmar recepción</Button></div>
            </DialogContent>
          </Dialog>
        )}

        {status !== "cancelada" && status !== "recibida" && <Button size="sm" variant="destructive" disabled={pending} onClick={() => { if (confirm("¿Cancelar esta OC?")) setStatus("cancelada"); }}>Cancelar OC</Button>}
      </div>
    </CardContent></Card>
  );
}
