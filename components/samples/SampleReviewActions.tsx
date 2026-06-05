"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { createClient } from "@/lib/supabase/client";
import { SAMPLE_LOCATIONS } from "@/lib/samples";

type Item = { product_id: string | null; product_name: string; supplier?: string | null; quantity?: number };

const UNSET = "__unset";

export function SampleReviewActions({
  requestId,
  repId,
  status,
  accountId,
  accountRegion,
  items,
}: {
  requestId: string;
  repId: string;
  status: string;
  accountId: string | null;
  accountRegion: string | null;
  items: Item[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const [pending, startTransition] = useTransition();
  const [addToAccount, setAddToAccount] = useState(true);
  const [location, setLocation] = useState<string>(UNSET);

  const setState = (next: string, reviewNotes?: string) => {
    startTransition(async () => {
      const { error } = await supabase
        .from("sample_requests")
        .update({
          status: next,
          reviewed_by: repId,
          reviewed_at: new Date().toISOString(),
          ...(reviewNotes != null ? { review_notes: reviewNotes || null } : {}),
        })
        .eq("id", requestId);
      if (error) { toast.error("No se pudo actualizar", { description: error.message }); return; }

      if (next === "aprobada") {
        // Las botellas entran al banco de muestras al autorizar (evita duplicar si se reaprueba).
        const { count } = await supabase
          .from("sample_bank_movements")
          .select("id", { count: "exact", head: true })
          .eq("source_request_id", requestId)
          .eq("kind", "ingreso");
        if (!count) {
          const movs = items
            .filter((i) => i.product_id)
            .map((i) => ({
              product_id: i.product_id,
              product_name: i.product_name,
              supplier: i.supplier ?? null,
              region: accountRegion,
              location: location === UNSET ? null : location,
              quantity: i.quantity ?? 1,
              kind: "ingreso",
              source_request_id: requestId,
              created_by: repId,
            }));
          if (movs.length) await supabase.from("sample_bank_movements").insert(movs);
        }
      }

      if (next === "entregada" && accountId && addToAccount) {
        const rows = items
          .filter((i) => i.product_id)
          .map((i) => ({ account_id: accountId, product_id: i.product_id, status: "muestra", added_by: repId }));
        if (rows.length) {
          await supabase.from("account_products").upsert(rows, { onConflict: "account_id,product_id", ignoreDuplicates: true });
        }
      }
      toast.success(
        next === "aprobada" ? "Solicitud aprobada" :
        next === "rechazada" ? "Solicitud rechazada" :
        next === "entregada" ? "Marcada como entregada" : "Actualizada",
      );
      router.refresh();
    });
  };

  return (
    <Card><CardContent className="space-y-4 p-6">
      <h3 className="font-display text-lg">Acciones</h3>
      {(status === "enviada" || status === "borrador") && (
        <form
          onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); setState("aprobada", String(fd.get("notes") ?? "")); }}
          className="space-y-2"
        >
          <Label htmlFor="notes">Comentario de revisión</Label>
          <Textarea id="notes" name="notes" placeholder="Observaciones, ajustes…" />
          <div className="space-y-1.5">
            <Label>Bodega donde se resguardan (opcional)</Label>
            <Select value={location} onValueChange={setLocation}>
              <SelectTrigger><SelectValue placeholder="Sin asignar" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={UNSET}>Sin asignar</SelectItem>
                {SAMPLE_LOCATIONS.map((loc) => (
                  <SelectItem key={loc} value={loc}>{loc}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Al aprobar, estas botellas entran al banco de muestras en esta bodega.</p>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="destructive" disabled={pending} onClick={() => { const n = prompt("Motivo del rechazo:") ?? ""; setState("rechazada", n); }}>Rechazar</Button>
            <Button type="submit" disabled={pending}>Aprobar</Button>
          </div>
        </form>
      )}
      {status === "aprobada" && (
        <div className="space-y-3">
          {accountId && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={addToAccount} onChange={(e) => setAddToAccount(e.target.checked)} className="h-4 w-4 rounded border-input" />
              Al entregar, registrar estos vinos como «muestra» en la cuenta
            </label>
          )}
          <Button disabled={pending} onClick={() => setState("entregada")}>Marcar como entregada</Button>
        </div>
      )}
      {(status === "entregada" || status === "rechazada") && (
        <p className="text-sm text-muted-foreground">Solicitud {status}. Sin acciones pendientes.</p>
      )}
    </CardContent></Card>
  );
}
