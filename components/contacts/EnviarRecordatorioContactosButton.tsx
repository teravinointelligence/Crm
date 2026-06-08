"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Mail } from "lucide-react";
import { Button } from "@/components/ui/button";

// Botón admin-only: dispara el correo colectivo de recordatorio a los vendedores
// para que actualicen los contactos de sus clientes (CC a Sabrina).
export function EnviarRecordatorioContactosButton() {
  const [pending, startTransition] = useTransition();

  const send = () => {
    if (!window.confirm("¿Enviar el recordatorio de contactos a todos los vendedores (con copia a Sabrina)?")) {
      return;
    }
    startTransition(async () => {
      const res = await fetch("/api/recordatorios/contactos-vendedores", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("No se pudo enviar el recordatorio", { description: data.error ?? `HTTP ${res.status}` });
        return;
      }
      const n = Array.isArray(data.to) ? data.to.length : 0;
      toast.success("Recordatorio enviado", { description: `A ${n} vendedor(es) · CC ${data.cc}` });
    });
  };

  return (
    <Button variant="outline" onClick={send} disabled={pending}>
      <Mail className="mr-1 h-4 w-4" />
      {pending ? "Enviando…" : "Recordatorio a vendedores"}
    </Button>
  );
}
