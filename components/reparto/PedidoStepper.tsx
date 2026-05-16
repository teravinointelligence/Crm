// Stepper visual del progreso del pedido. No es interactivo; el cambio de
// estatus se hace desde PedidoDetailActions (PATCH /api/reparto/pedidos/[id]).

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PedidoEstatus } from "@/types/reparto";

const STEPS: { key: PedidoEstatus; label: string }[] = [
  { key: "pendiente_asignar", label: "Pendiente" },
  { key: "asignado", label: "Asignado" },
  { key: "en_ruta", label: "En ruta" },
  { key: "entregado", label: "Entregado" },
];

export function PedidoStepper({ estatus }: { estatus: PedidoEstatus }) {
  if (estatus === "no_entregado") {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
        <strong>No entregado.</strong> Revisa el motivo y reasigna o reagenda.
      </div>
    );
  }
  const currentIdx = STEPS.findIndex((s) => s.key === estatus);
  return (
    <ol className="flex items-center gap-2">
      {STEPS.map((s, idx) => {
        const done = idx <= currentIdx;
        const isCurrent = idx === currentIdx;
        return (
          <li key={s.key} className="flex flex-1 items-center gap-2">
            <div
              className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs",
                done
                  ? "bg-brand-carmesi text-white"
                  : "border border-muted-foreground/30 bg-card text-muted-foreground",
              )}
            >
              {done ? <Check className="h-3.5 w-3.5" /> : idx + 1}
            </div>
            <span
              className={cn(
                "text-xs",
                isCurrent ? "font-medium text-foreground" : "text-muted-foreground",
              )}
            >
              {s.label}
            </span>
            {idx < STEPS.length - 1 && (
              <div className={cn("mx-1 h-px flex-1", done ? "bg-brand-carmesi" : "bg-muted-foreground/20")} />
            )}
          </li>
        );
      })}
    </ol>
  );
}
