"use client";

// Acciones disponibles desde la pantalla de detalle de una consignación:
//   - Registrar movimiento (venta + devolución + cobro, aditivo).
//   - Cerrar como liquidada o devuelta (estado terminal).
//
// Se muestra solo si la consignación no está en estado terminal. El server
// vuelve a validar todo (scope, topes, estado), así que este componente
// puede confiar en feedback "happy path" + manejo de error genérico.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, RotateCcw, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { formatCurrency } from "@/lib/utils";
import type { Base44Consignacion } from "@/lib/base44";

type Props = {
  consignacion: Base44Consignacion;
  /** Suma total de items.cantidad — para mostrar disponible y validar en cliente. */
  totalCantidad: number;
};

export function ConsignacionActions({ consignacion, totalCantidad }: Props) {
  if (consignacion.estado === "liquidada" || consignacion.estado === "devuelta") {
    return null;
  }
  return (
    <div className="flex flex-wrap gap-2">
      <MovimientoDialog consignacion={consignacion} totalCantidad={totalCantidad} />
      <CerrarDialog consignacion={consignacion} />
    </div>
  );
}

function MovimientoDialog({
  consignacion,
  totalCantidad,
}: {
  consignacion: Base44Consignacion;
  totalCantidad: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const [vendidas, setVendidas] = useState<number>(0);
  const [devueltas, setDevueltas] = useState<number>(0);
  const [cobrado, setCobrado] = useState<number>(0);
  const [notas, setNotas] = useState("");

  const prevVendidas = Number(consignacion.cantidad_vendida ?? 0);
  const prevDevueltas = Number(consignacion.cantidad_devuelta ?? 0);
  const restante = Math.max(0, totalCantidad - prevVendidas - prevDevueltas);
  const total = Number(consignacion.total ?? 0);
  const prevCobrado = Number(consignacion.monto_cobrado ?? 0);
  const saldoPendiente = Math.max(0, total - prevCobrado);

  const movido = vendidas + devueltas;
  const excedeUnidades = totalCantidad > 0 && movido > restante;
  const excedeCobro = total > 0 && prevCobrado + cobrado > total + 0.01;
  const isEmpty = vendidas === 0 && devueltas === 0 && cobrado === 0;
  const hasNegative = [vendidas, devueltas, cobrado].some((n) => n < 0);

  const reset = () => {
    setVendidas(0);
    setDevueltas(0);
    setCobrado(0);
    setNotas("");
  };

  const submit = () => {
    startTransition(async () => {
      const res = await fetch(`/api/consignaciones/${consignacion.id}/movimiento`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vendidas, devueltas, cobrado, notas: notas.trim() || undefined }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error("No se pudo registrar el movimiento", { description: data.error ?? `HTTP ${res.status}` });
        return;
      }
      const { estado } = (await res.json()) as { estado: Base44Consignacion["estado"] };
      toast.success(
        estado === "liquidada"
          ? "Movimiento registrado · consignación liquidada"
          : estado === "devuelta"
            ? "Movimiento registrado · consignación devuelta"
            : "Movimiento registrado",
      );
      setOpen(false);
      reset();
      router.refresh();
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>
        <Button>
          <FileText className="mr-1 h-4 w-4" />
          Registrar movimiento
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar movimiento</DialogTitle>
          <DialogDescription>
            Los valores se <strong>suman</strong> a lo ya registrado.{" "}
            {totalCantidad > 0 && <>Disponibles: <strong>{restante}</strong> de {totalCantidad} unidades.</>}{" "}
            {total > 0 && <>Saldo: <strong>{formatCurrency(saldoPendiente)}</strong>.</>}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="vendidas">Vendidas</Label>
              <Input
                id="vendidas"
                type="number"
                min={0}
                step={1}
                value={vendidas}
                onChange={(e) => setVendidas(Number(e.target.value))}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="devueltas">Devueltas</Label>
              <Input
                id="devueltas"
                type="number"
                min={0}
                step={1}
                value={devueltas}
                onChange={(e) => setDevueltas(Number(e.target.value))}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="cobrado">Cobrado en esta transacción (MXN)</Label>
            <Input
              id="cobrado"
              type="number"
              min={0}
              step="0.01"
              value={cobrado}
              onChange={(e) => setCobrado(Number(e.target.value))}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="notas">Notas (opcional)</Label>
            <Textarea
              id="notas"
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              rows={2}
              placeholder="Referencia de pago, observaciones..."
            />
          </div>

          {excedeUnidades && (
            <p className="text-xs text-red-700">
              La suma de vendidas + devueltas excede las {restante} unidades disponibles.
            </p>
          )}
          {excedeCobro && (
            <p className="text-xs text-red-700">
              El cobro acumulado excedería el total de la consignación.
            </p>
          )}
          {hasNegative && (
            <p className="text-xs text-red-700">No se permiten valores negativos.</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button
            onClick={submit}
            disabled={pending || isEmpty || excedeUnidades || excedeCobro || hasNegative}
          >
            {pending ? "Guardando…" : "Guardar movimiento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CerrarDialog({ consignacion }: { consignacion: Base44Consignacion }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [tipo, setTipo] = useState<"liquidada" | "devuelta">("liquidada");
  const [motivo, setMotivo] = useState("");

  const submit = () => {
    startTransition(async () => {
      const res = await fetch(`/api/consignaciones/${consignacion.id}/cerrar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo, motivo: motivo.trim() || undefined }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error("No se pudo cerrar la consignación", { description: data.error ?? `HTTP ${res.status}` });
        return;
      }
      toast.success(tipo === "liquidada" ? "Consignación liquidada" : "Consignación devuelta");
      setOpen(false);
      router.refresh();
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <CheckCircle2 className="mr-1 h-4 w-4" />
          Cerrar consignación
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Cerrar consignación</DialogTitle>
          <DialogDescription>
            Marca la consignación como terminal. Esta acción no se puede revertir
            desde el CRM (habría que editarla directo en Base44).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-2">
            <Label>Tipo de cierre</Label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setTipo("liquidada")}
                className={`rounded-md border p-3 text-left text-sm ${
                  tipo === "liquidada" ? "border-brand-carmesi bg-brand-carmesi/5" : ""
                }`}
              >
                <div className="flex items-center gap-2 font-medium">
                  <CheckCircle2 className="h-4 w-4" />
                  Liquidada
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  La consignación se vendió/cobró completa o se cierra como tal.
                </p>
              </button>
              <button
                type="button"
                onClick={() => setTipo("devuelta")}
                className={`rounded-md border p-3 text-left text-sm ${
                  tipo === "devuelta" ? "border-brand-carmesi bg-brand-carmesi/5" : ""
                }`}
              >
                <div className="flex items-center gap-2 font-medium">
                  <RotateCcw className="h-4 w-4" />
                  Devuelta
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  El cliente regresó el producto sin vender.
                </p>
              </button>
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="motivo">Motivo (opcional)</Label>
            <Textarea
              id="motivo"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={2}
              placeholder="Por qué se cierra, condiciones..."
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending ? "Cerrando…" : tipo === "liquidada" ? "Marcar liquidada" : "Marcar devuelta"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
