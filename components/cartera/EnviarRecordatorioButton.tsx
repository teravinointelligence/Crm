"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Draft = { to: string[]; subject: string };

export function EnviarRecordatorioButton({ accountId }: { accountId: string }) {
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState<Draft | null>(null);

  const loadDraft = () => {
    startTransition(async () => {
      const res = await fetch(`/api/cartera/${accountId}/recordatorio`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("No se pudo preparar el recordatorio", {
          description: data.error ?? `HTTP ${res.status}`,
        });
        return;
      }
      setDraft({
        to: Array.isArray(data.to) ? data.to : [data.to].filter(Boolean),
        subject: data.subject,
      });
    });
  };

  const send = () => {
    startTransition(async () => {
      const res = await fetch(`/api/cartera/${accountId}/recordatorio`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("No se pudo enviar el recordatorio", { description: data.error ?? `HTTP ${res.status}` });
        return;
      }
      const sentTo = Array.isArray(data.to) ? data.to.join(", ") : data.to;
      toast.success("Recordatorio enviado", { description: `A ${sentTo}` });
      setDraft(null);
    });
  };

  return (
    <>
      <Button variant="outline" onClick={loadDraft} disabled={pending}>
        <Mail className="mr-1 h-4 w-4" />
        {pending && !draft ? "Preparando…" : "Enviar recordatorio"}
      </Button>

      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enviar recordatorio de pago</DialogTitle>
          </DialogHeader>
          {draft && (
            <div className="space-y-3 text-sm">
              <p className="text-muted-foreground">
                Se enviará el estado de cuenta con los saldos pendientes a los
                correos registrados de esta cuenta:
              </p>
              <ul className="space-y-1 rounded-md border bg-muted/30 p-3">
                {draft.to.map((email) => (
                  <li key={email} className="font-medium">
                    {email}
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground">
                Asunto: {draft.subject}
              </p>
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => setDraft(null)}
                  disabled={pending}
                >
                  Cancelar
                </Button>
                <Button onClick={send} disabled={pending}>
                  <Mail className="mr-1 h-4 w-4" />
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
