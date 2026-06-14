"use client";

// Botón en la ficha del cliente para enviarle por correo el portafolio de
// vinos (enlace al PDF) de la zona elegida, a todos sus correos registrados.

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Zona = { slug: string; nombre: string };
type Draft = { cliente: string; to: string[]; detectedZona: string | null; zonasDisponibles: Zona[] };

export function EnviarPortafolioButton({ accountId }: { accountId: string }) {
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [zona, setZona] = useState<string>("");

  const loadDraft = () => {
    startTransition(async () => {
      const res = await fetch(`/api/cuentas/${accountId}/portafolio`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("No se pudo preparar el envío", { description: data.error ?? `HTTP ${res.status}` });
        return;
      }
      const zonas: Zona[] = Array.isArray(data.zonasDisponibles) ? data.zonasDisponibles : [];
      setDraft({
        cliente: data.cliente ?? "",
        to: Array.isArray(data.to) ? data.to : [],
        detectedZona: data.detectedZona ?? null,
        zonasDisponibles: zonas,
      });
      setZona(data.detectedZona ?? zonas[0]?.slug ?? "");
    });
  };

  const send = () => {
    if (!zona) return;
    startTransition(async () => {
      const res = await fetch(`/api/cuentas/${accountId}/portafolio`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ zona }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("No se pudo enviar el portafolio", { description: data.error ?? `HTTP ${res.status}` });
        return;
      }
      const sentTo = Array.isArray(data.to) ? data.to.join(", ") : data.to;
      toast.success(`Portafolio (${data.zonaNombre}) enviado`, { description: `A ${sentTo}` });
      setDraft(null);
    });
  };

  return (
    <>
      <Button variant="outline" onClick={loadDraft} disabled={pending}>
        <Send className="mr-1 h-4 w-4" />
        {pending && !draft ? "Preparando…" : "Enviar portafolio"}
      </Button>

      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enviar portafolio al cliente</DialogTitle>
          </DialogHeader>
          {draft && (
            <div className="space-y-3 text-sm">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Zona del portafolio</label>
                <select
                  value={zona}
                  onChange={(e) => setZona(e.target.value)}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                >
                  {draft.zonasDisponibles.map((z) => (
                    <option key={z.slug} value={z.slug}>
                      {z.nombre}
                      {z.slug === draft.detectedZona ? " (zona del cliente)" : ""}
                    </option>
                  ))}
                </select>
              </div>
              <p className="text-muted-foreground">
                Se enviará el enlace al portafolio a los correos registrados de esta cuenta:
              </p>
              <ul className="space-y-1 rounded-md border bg-muted/30 p-3">
                {draft.to.map((email) => (
                  <li key={email} className="font-medium">{email}</li>
                ))}
              </ul>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setDraft(null)} disabled={pending}>
                  Cancelar
                </Button>
                <Button onClick={send} disabled={pending || !zona}>
                  <Send className="mr-1 h-4 w-4" />
                  {pending ? "Enviando…" : `Enviar a ${draft.to.length} correo${draft.to.length === 1 ? "" : "s"}`}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
