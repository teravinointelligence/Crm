"use client";

// Botón "Enviar por mail" de una solicitud de muestras. Abre un diálogo con el
// destinatario precargado (contacto del cliente, editable) y envía el correo de
// verdad vía /api/samples/[id]/enviar, con el PDF adjunto. Reemplaza al antiguo
// enlace mailto: (que dependía de la app de correo del dispositivo y no adjuntaba PDF).

import { useState } from "react";
import { Mail, Send, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function SendSampleEmail({ sampleId }: { sampleId: string }) {
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);

  async function abrir() {
    setOpen(true);
    setLoading(true);
    try {
      const res = await fetch(`/api/samples/${sampleId}/enviar`, { method: "GET" });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setTo(data.to ?? "");
        setSubject(data.subject ?? "");
      } else {
        toast.error("No se pudo cargar el borrador", { description: data.error });
      }
    } catch (e) {
      toast.error("Error de red", { description: e instanceof Error ? e.message : undefined });
    } finally {
      setLoading(false);
    }
  }

  async function enviar() {
    if (sending) return;
    setSending(true);
    try {
      const res = await fetch(`/api/samples/${sampleId}/enviar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("No se pudo enviar", { description: data.error ?? `HTTP ${res.status}` });
        return;
      }
      toast.success("Correo enviado", { description: `Enviado a ${data.to}` });
      setOpen(false);
    } catch (e) {
      toast.error("Error de red", { description: e instanceof Error ? e.message : undefined });
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={abrir}>
        <Mail className="mr-1 h-4 w-4" /> Enviar por mail
      </Button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => !sending && setOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-lg border bg-card shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between border-b px-5 py-4">
              <div>
                <h2 className="font-display text-lg">Enviar muestras por correo</h2>
                <p className="text-sm text-muted-foreground">Se adjunta el PDF de la solicitud.</p>
              </div>
              <button
                onClick={() => !sending && setOpen(false)}
                className="rounded-md p-1 text-muted-foreground hover:bg-muted disabled:opacity-50"
                disabled={sending}
                aria-label="Cerrar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3 px-5 py-4">
              {loading ? (
                <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Cargando borrador…
                </div>
              ) : (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="mail-to">Para</Label>
                    <Input
                      id="mail-to"
                      type="email"
                      value={to}
                      onChange={(e) => setTo(e.target.value)}
                      placeholder="cliente@correo.com"
                    />
                    {!to && (
                      <p className="text-xs text-amber-600">
                        El cliente no tiene contacto con email. Escribe el destino.
                      </p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label>Asunto</Label>
                    <p className="rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                      {subject || "—"}
                    </p>
                  </div>
                </>
              )}
            </div>

            <div className="flex justify-end gap-2 border-t px-5 py-3">
              <Button variant="ghost" onClick={() => setOpen(false)} disabled={sending}>
                Cancelar
              </Button>
              <Button onClick={enviar} disabled={loading || sending || !to}>
                {sending ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                ) : (
                  <Send className="mr-1 h-4 w-4" />
                )}
                Enviar
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
