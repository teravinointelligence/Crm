"use client";

// Botón en el detalle del pedido para enviarlo al buzón interno
// pedidos@teravino.com con el PDF adjunto.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";

export function EnviarPedidoButton({
  orderId,
  orderNumber,
}: {
  orderId: string;
  orderNumber: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [sent, setSent] = useState(false);

  function send() {
    if (!confirm(`¿Enviar el pedido ${orderNumber} a pedidos@teravino.com?`)) return;
    startTransition(async () => {
      const res = await fetch(`/api/orders/${orderId}/enviar`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("No se pudo enviar el pedido", { description: data.error ?? `HTTP ${res.status}` });
        return;
      }
      toast.success("Pedido enviado", { description: `A ${data.to}` });
      setSent(true);
      router.refresh();
    });
  }

  return (
    <Button onClick={send} disabled={pending}>
      <Send className="mr-1 h-4 w-4" />
      {pending ? "Enviando…" : sent ? "Enviado ✓" : "Enviar a pedidos@"}
    </Button>
  );
}
