"use client";

// Acciones disponibles desde la pantalla de detalle de una consignación:
//   - Registrar movimiento (venta + devolución + cobro, aditivo).
//   - Cerrar como liquidada o devuelta (estado terminal).
//   - Asignar / desasignar chofer (disponible incluso en estado terminal por
//     si hay que corregir el dato histórico).
//
// El server vuelve a validar todo (scope, topes, estado), así que este
// componente puede confiar en feedback "happy path" + manejo de error genérico.

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, RotateCcw, FileText, Truck } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCurrency } from "@/lib/utils";
import type { Base44Consignacion } from "@/lib/base44";
import { ReposicionDialog } from "./ReposicionDialog";
import { RetiroDialog } from "./RetiroDialog";

type Props = {
  consignacion: Base44Consignacion;
  /** Suma total de items.cantidad — para mostrar disponible y validar en cliente. */
  totalCantidad: number;
};

export function ConsignacionActions({ consignacion, totalCantidad }: Props) {
  const isTerminal =
    consignacion.estado === "liquidada" || consignacion.estado === "devuelta";
  return (
    <div className="flex flex-wrap gap-2">
      {!isTerminal && (
        <>
          <MovimientoDialog consignacion={consignacion} totalCantidad={totalCantidad} />
          <CerrarDialog consignacion={consignacion} />
          <ReposicionDialog consignacion={consignacion} />
          <RetiroDialog consignacion={consignacion} />
        </>
      )}
      <AsignarChoferDialog consignacion={consignacion} />
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

type Chofer = { id: string; nombre: string };

function AsignarChoferDialog({ consignacion }: { consignacion: Base44Consignacion }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [choferes, setChoferes] = useState<Chofer[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string>(consignacion.chofer_id ?? "");

  // Carga lazy de choferes cuando se abre el dialog.
  useEffect(() => {
    if (!open || choferes !== null || loadError) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/consignaciones/choferes");
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          if (!cancelled) setLoadError(data.error ?? `HTTP ${res.status}`);
          return;
        }
        const { data } = (await res.json()) as { data: Chofer[] };
        if (!cancelled) setChoferes(data);
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : "Error al cargar choferes");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, choferes, loadError]);

  const currentLabel = consignacion.chofer_nombre ?? "Sin asignar";
  const isUnchanged = (consignacion.chofer_id ?? "") === selectedId;

  const submit = (chofer_id: string | null) => {
    startTransition(async () => {
      const res = await fetch(`/api/consignaciones/${consignacion.id}/asignar-chofer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chofer_id }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error("No se pudo asignar chofer", { description: data.error ?? `HTTP ${res.status}` });
        return;
      }
      toast.success(chofer_id ? "Chofer asignado" : "Chofer desasignado");
      setOpen(false);
      router.refresh();
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setSelectedId(consignacion.chofer_id ?? "");
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">
          <Truck className="mr-1 h-4 w-4" />
          {consignacion.chofer_id ? "Cambiar chofer" : "Asignar chofer"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Asignar chofer</DialogTitle>
          <DialogDescription>
            Actualmente: <strong>{currentLabel}</strong>. Los choferes vienen del módulo de Reparto.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {loadError ? (
            <p className="rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-700">
              {loadError}
            </p>
          ) : choferes === null ? (
            <p className="text-sm text-muted-foreground">Cargando choferes…</p>
          ) : choferes.length === 0 ? (
            <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              No hay choferes activos en el módulo de Reparto. Da uno de alta en
              <em> /reparto/choferes</em> y vuelve.
            </p>
          ) : (
            <div className="space-y-1">
              <Label>Chofer</Label>
              <Select value={selectedId} onValueChange={setSelectedId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona un chofer..." />
                </SelectTrigger>
                <SelectContent>
                  {choferes.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
          {consignacion.chofer_id && (
            <Button
              variant="ghost"
              onClick={() => submit(null)}
              disabled={pending}
              className="text-red-700 hover:text-red-800"
            >
              Desasignar
            </Button>
          )}
          <div className="flex gap-2 sm:ml-auto">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancelar
            </Button>
            <Button
              onClick={() => submit(selectedId)}
              disabled={pending || !selectedId || isUnchanged}
            >
              {pending ? "Guardando…" : "Asignar"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

