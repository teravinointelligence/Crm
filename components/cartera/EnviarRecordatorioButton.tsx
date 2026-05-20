"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Mail } from "lucide-react";
import { Button } from "@/components/ui/button";

export function EnviarRecordatorioButton({ accountId }: { accountId: string }) {
  const [pending, startTransition] = useTransition();

  const send = () => {
    startTransition(async () => {
      const res = await fetch(`/api/cartera/${accountId}/recordatorio`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("No se pudo enviar el recordatorio", { description: data.error ?? `HTTP ${res.status}` });
        return;
      }
      toast.success("Recordatorio enviado", { description: `A ${data.to}` });
    });
  };

  return (
    <Button variant="outline" onClick={send} disabled={pending}>
      <Mail className="mr-1 h-4 w-4" />
      {pending ? "Enviando…" : "Enviar recordatorio"}
    </Button>
  );
}
