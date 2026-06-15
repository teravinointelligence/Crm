"use client";

// Confirma un retiro y aplica sus unidades al inventario de la consignación.

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function AplicarRetiroButton({
  retiroId,
  folio,
  unidades,
}: {
  retiroId: string;
  folio: string;
  unidades: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const onClick = () => {
    if (
      !confirm(
        `¿Confirmar y aplicar el retiro ${folio}? Se descontarán ${unidades} unidad${unidades === 1 ? "" : "es"} del inventario de la consignación (como devueltas).`,
      )
    )
      return;
    startTransition(async () => {
      const res = await fetch(`/api/consignaciones/retiros/${retiroId}/aplicar`, { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("No se pudo aplicar el retiro", { description: json.error ?? `HTTP ${res.status}` });
        return;
      }
      toast.success("Retiro aplicado", { description: `${json.devueltas} unidades descontadas del inventario` });
      router.refresh();
    });
  };

  return (
    <Button size="sm" variant="outline" onClick={onClick} disabled={pending}>
      <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
      {pending ? "Aplicando…" : "Confirmar y aplicar"}
    </Button>
  );
}
