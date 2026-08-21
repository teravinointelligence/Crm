"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";

type ReviewState = "aprobada" | "rechazada" | "entregada";

export function SampleReviewActions({
  requestId,
  status,
  hasAccounts,
  driveUrl,
  driveError,
}: {
  requestId: string;
  status: string;
  hasAccounts: boolean;
  driveUrl: string | null;
  driveError: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [addToAccount, setAddToAccount] = useState(true);

  const setState = (next?: ReviewState, reviewNotes?: string, retryDrive = false) => {
    startTransition(async () => {
      try {
        const response = await fetch(`/api/samples/${requestId}/review`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ next, reviewNotes, addToAccount, retryDrive }),
        });
        const result = (await response.json().catch(() => ({}))) as {
          error?: string;
          warning?: string;
        };
        if (!response.ok) {
          toast.error("No se pudo actualizar", { description: result.error });
          return;
        }
        if (result.warning) {
          toast.warning(
            retryDrive ? "La muestra sigue aprobada, pero no se pudo enviar el enlace" : "Solicitud aprobada",
            { description: result.warning },
          );
          router.refresh();
          return;
        }
        toast.success(
          retryDrive ? "Enlace de Drive enviado al vendedor" :
          next === "aprobada" ? "Solicitud aprobada" :
          next === "rechazada" ? "Solicitud rechazada" :
          next === "entregada" ? "Marcada como entregada" : "Actualizada",
        );
        router.refresh();
      } catch (error) {
        toast.error("No se pudo conectar con el CRM", {
          description: error instanceof Error ? error.message : undefined,
        });
      }
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
          {hasAccounts && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={addToAccount} onChange={(e) => setAddToAccount(e.target.checked)} className="h-4 w-4 rounded border-input" />
              Al entregar, registrar estos vinos como «muestra» en las cuentas relacionadas
            </label>
          )}
          <div className="flex flex-wrap gap-2">
            <Button disabled={pending} onClick={() => setState("entregada")}>Marcar como entregada</Button>
            {driveUrl ? (
              <Button asChild variant="outline">
                <a href={driveUrl} target="_blank" rel="noreferrer">Abrir paquete en Drive</a>
              </Button>
            ) : (
              <Button variant="outline" disabled={pending} onClick={() => setState(undefined, undefined, true)}>
                Reintentar envío de fichas
              </Button>
            )}
          </div>
          {driveError && <p className="text-xs text-amber-700">Drive: {driveError}</p>}
        </div>
      )}
      {(status === "entregada" || status === "rechazada" || status === "cancelada") && (
        <p className="text-sm text-muted-foreground">Solicitud {status}. Sin acciones pendientes.</p>
      )}
    </CardContent></Card>
  );
}
