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

type Item = { product_id: string | null; product_name: string };

export function SampleReviewActions({
  requestId,
  repId,
  status,
  accountId,
  items,
}: {
  requestId: string;
  repId: string;
  status: string;
  accountId: string | null;
  items: Item[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const [pending, startTransition] = useTransition();
  const [addToAccount, setAddToAccount] = useState(true);

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
