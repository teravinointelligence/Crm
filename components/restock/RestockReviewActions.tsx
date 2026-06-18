"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";

type Item = { id: string; product_name: string; supplier: string | null; quantity_requested: number; quantity_approved: number | null };

export function RestockReviewActions({
  requestId,
  repId,
  items,
}: {
  requestId: string;
  repId: string;
  items: Item[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const [pending, startTransition] = useTransition();
  const [approved, setApproved] = useState<Record<string, number>>(
    Object.fromEntries(items.map((i) => [i.id, i.quantity_approved ?? i.quantity_requested])),
  );

  // Agrupar por proveedor (una OC por proveedor).
  const groups = (() => {
    const m = new Map<string, Item[]>();
    for (const i of items) {
      const k = i.supplier?.trim() || "Sin proveedor";
      const arr = m.get(k) ?? [];
      arr.push(i);
      m.set(k, arr);
    }
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  })();

  const decide = (status: "aprobada" | "rechazada", reviewNotes: string) => {
    startTransition(async () => {
      if (status === "aprobada") {
        for (const i of items) {
          await supabase.from("restock_request_items").update({ quantity_approved: approved[i.id] ?? i.quantity_requested }).eq("id", i.id);
        }
      }
      const { error } = await supabase
        .from("restock_requests")
        .update({ status, reviewed_by: repId, reviewed_at: new Date().toISOString(), review_notes: reviewNotes || null })
        .eq("id", requestId);
      if (error) { toast.error("No pudimos actualizar", { description: error.message }); return; }
      toast.success(status === "aprobada" ? "Pedido aprobado" : "Pedido rechazado");
      router.refresh();
    });
  };

  return (
    <Card><CardContent className="space-y-4 p-6">
      <h3 className="font-display text-lg">Revisión</h3>
      <table className="min-w-full text-sm">
        <thead className="border-b text-left text-xs uppercase text-muted-foreground"><tr><th className="py-2">Producto</th><th className="py-2 text-right">Pedido</th><th className="py-2 text-right w-28">Aprobar</th></tr></thead>
        {groups.map(([supplier, group]) => (
          <tbody key={supplier}>
            <tr><td colSpan={3} className="pt-3 pb-1 text-xs font-semibold uppercase tracking-wide text-brand-carmesi">{supplier}</td></tr>
            {group.map((i) => (
              <tr key={i.id} className="border-b">
                <td className="py-2">{i.product_name}</td>
                <td className="py-2 text-right text-muted-foreground">{i.quantity_requested}</td>
                <td className="py-2 text-right"><Input type="number" min={0} value={approved[i.id] ?? 0} onChange={(e) => setApproved((p) => ({ ...p, [i.id]: Number(e.target.value) || 0 }))} className="h-8 text-right" /></td>
              </tr>
            ))}
          </tbody>
        ))}
      </table>
      <form onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); decide("aprobada", String(fd.get("notes") ?? "")); }} className="space-y-2">
        <Label htmlFor="notes">Comentario de revisión</Label>
        <Textarea id="notes" name="notes" placeholder="Ajustes, observaciones…" />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="destructive" disabled={pending} onClick={() => { const n = prompt("Motivo del rechazo:") ?? ""; decide("rechazada", n); }}>Rechazar</Button>
          <Button type="submit" disabled={pending}>{pending ? "Guardando…" : "Aprobar"}</Button>
        </div>
      </form>
    </CardContent></Card>
  );
}
