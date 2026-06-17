"use client";

// Botón en la ficha del cliente para enviarle por correo los requisitos de
// consignación (con el PDF adjunto), a los correos seleccionados de la cuenta.

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ClipboardList, Send, FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Draft = { cliente: string; to: string[] };

export function PedirRequisitosButton({ accountId }: { accountId: string }) {
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [selected, setSelected] = useState<string[]>([]);

  const toggle = (email: string) =>
    setSelected((s) => (s.includes(email) ? s.filter((e) => e !== email) : [...s, email]));

  const loadDraft = () => {
    startTransition(async () => {
      const res = await fetch(`/api/cuentas/${accountId}/requisitos-consignacion`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("No se pudo preparar el envío", { description: data.error ?? `HTTP ${res.status}` });
        return;
      }
      const correos: string[] = Array.isArray(data.to) ? data.to : [];
      setDraft({ cliente: data.cliente ?? "", to: correos });
      setSelected(correos);
    });
  };

  const send = () => {
    if (selected.length === 0) return;
    startTransition(async () => {
      const res = await fetch(`/api/cuentas/${accountId}/requisitos-consignacion`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: selected }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("No se pudo enviar", { description: data.error ?? `HTTP ${res.status}` });
        return;
      }
      const sentTo = Array.isArray(data.to) ? data.to.join(", ") : data.to;
      toast.success("Requisitos enviados", { description: `A ${sentTo}` });
      setDraft(null);
    });
  };

  return (
    <>
      <Button variant="outline" onClick={loadDraft} disabled={pending}>
        <ClipboardList className="mr-1 h-4 w-4" />
        {pending && !draft ? "Preparando…" : "Pedir requisitos"}
      </Button>

      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pedir requisitos de consignación</DialogTitle>
          </DialogHeader>
          {draft && (
            <div className="space-y-3 text-sm">
              <p className="text-muted-foreground">
                Se enviará el correo con la lista de requisitos y el PDF adjunto a los
                correos seleccionados de <strong>{draft.cliente}</strong>:
              </p>
              <ul className="space-y-1 rounded-md border bg-muted/30 p-3">
                {draft.to.map((email) => (
                  <li key={email}>
                    <label className="flex cursor-pointer items-center gap-2 font-medium">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-brand-carmesi"
                        checked={selected.includes(email)}
                        onChange={() => toggle(email)}
                      />
                      {email}
                    </label>
                  </li>
                ))}
              </ul>
              <a
                href="/api/consignaciones/requisitos/pdf"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center text-xs text-brand-carmesi hover:underline"
              >
                <FileDown className="mr-1 h-3.5 w-3.5" />
                Ver el PDF que se adjuntará
              </a>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setDraft(null)} disabled={pending}>
                  Cancelar
                </Button>
                <Button onClick={send} disabled={pending || selected.length === 0}>
                  <Send className="mr-1 h-4 w-4" />
                  {pending
                    ? "Enviando…"
                    : selected.length === 0
                      ? "Elige un correo"
                      : `Enviar a ${selected.length} correo${selected.length === 1 ? "" : "s"}`}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
