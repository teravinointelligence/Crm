// Muestra el horario de recepción del cliente en el detalle del pedido de Reparto.
//
// Prioridad: el horario capturado por el vendedor en la cuenta del CRM (enlazada
// por RFC) manda; si no hay cuenta enlazada, se usa/edita el de reparto.clientes.
// Logística (admin / jefe_logistica) puede editar el valor de reparto como
// respaldo cuando el cliente no tiene cuenta enlazada.

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Clock, Pencil } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function ClienteHorario({
  clienteId,
  repartoHorario,
  accountHorario,
  accountRfc,
  canManage,
}: {
  clienteId: string | null;
  repartoHorario: string | null;
  accountHorario: string | null;
  accountRfc: string | null;
  canManage: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(repartoHorario ?? "");
  const [pending, startTransition] = useTransition();

  const fromAccount = Boolean(accountHorario);
  const effective = accountHorario ?? repartoHorario;

  const save = () => {
    if (!clienteId) return;
    startTransition(async () => {
      const res = await fetch(`/api/reparto/clientes/${clienteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ horario_recepcion: value }),
      });
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: "" }));
        toast.error("No se pudo guardar el horario", { description: error });
        return;
      }
      toast.success("Horario actualizado");
      setEditing(false);
      router.refresh();
    });
  };

  return (
    <div className="mt-2 rounded-md border bg-accent/10 p-2 text-sm">
      <div className="flex items-start gap-2">
        <Clock className="mt-0.5 h-4 w-4 shrink-0 text-brand-carmesi" />
        <div className="min-w-0 flex-1">
          <p>
            <strong>Horario de recepción:</strong>{" "}
            {effective ? effective : <span className="text-muted-foreground">sin registrar</span>}
          </p>
          {fromAccount && (
            <p className="text-xs text-muted-foreground">
              Capturado por el vendedor en la cuenta{accountRfc ? ` (RFC ${accountRfc})` : ""}.
            </p>
          )}
          {!fromAccount && canManage && clienteId && !editing && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="mt-1 inline-flex items-center gap-1 text-xs text-brand-carmesi hover:underline"
            >
              <Pencil className="h-3 w-3" /> {repartoHorario ? "Editar horario" : "Agregar horario"}
            </button>
          )}
        </div>
      </div>

      {!fromAccount && editing && (
        <div className="mt-2 space-y-2">
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="p. ej. Lun-Vie 8:00-13:00"
            disabled={pending}
          />
          <p className="text-xs text-muted-foreground">
            Respaldo de Reparto. Si más adelante se enlaza la cuenta del CRM por RFC, manda el horario de la cuenta.
          </p>
          <div className="flex gap-2">
            <Button size="sm" onClick={save} disabled={pending}>
              {pending ? "Guardando…" : "Guardar"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setValue(repartoHorario ?? "");
                setEditing(false);
              }}
              disabled={pending}
            >
              Cancelar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
