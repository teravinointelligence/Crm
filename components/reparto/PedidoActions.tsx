// Acciones del detalle de un pedido: reasignar chofer, cambiar estatus,
// editar ventana horaria, notas, dirección de entrega.

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { PEDIDO_ESTATUS, PRIORIDADES, ESTATUS_LABEL, type PedidoEstatus, type Prioridad } from "@/types/reparto";

type Chofer = { id: string; nombre: string };

// Radix Select v2 no permite <SelectItem value="">; usamos un centinela para
// la opción "Sin asignar" y lo mapeamos a "" (→ null en el PATCH).
const SIN_ASIGNAR = "sin_asignar";

export function PedidoActions({
  pedidoId,
  initial,
  choferes,
}: {
  pedidoId: string;
  initial: {
    estatus: PedidoEstatus;
    chofer_id: string | null;
    prioridad: Prioridad | null;
    ventana_inicio: string | null;
    ventana_fin: string | null;
    direccion_entrega: string | null;
    notas: string | null;
    motivo_problema: string | null;
  };
  choferes: Chofer[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [estatus, setEstatus] = useState<PedidoEstatus>(initial.estatus);
  const [choferId, setChoferId] = useState(initial.chofer_id ?? "");
  const [prioridad, setPrioridad] = useState<Prioridad>(initial.prioridad ?? "normal");
  const [vi, setVi] = useState(initial.ventana_inicio?.slice(0, 5) ?? "");
  const [vf, setVf] = useState(initial.ventana_fin?.slice(0, 5) ?? "");
  const [direccion, setDireccion] = useState(initial.direccion_entrega ?? "");
  const [notas, setNotas] = useState(initial.notas ?? "");
  const [motivo, setMotivo] = useState(initial.motivo_problema ?? "");

  const save = () => {
    startTransition(async () => {
      const res = await fetch(`/api/reparto/pedidos/${pedidoId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          estatus,
          chofer_id: choferId || null,
          prioridad,
          ventana_inicio: vi || null,
          ventana_fin: vf || null,
          direccion_entrega: direccion || null,
          notas: notas || null,
          motivo_problema: estatus === "no_entregado" ? motivo || null : null,
        }),
      });
      const json = await res.json();
      if (!res.ok) { toast.error(json.error ?? "Error"); return; }
      toast.success("Pedido actualizado");
      router.refresh();
    });
  };

  return (
    <Card><CardContent className="grid gap-4 p-6 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Label>Estatus</Label>
        <Select value={estatus} onValueChange={(v) => setEstatus(v as PedidoEstatus)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {PEDIDO_ESTATUS.map((s) => <SelectItem key={s} value={s}>{ESTATUS_LABEL[s]}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>Chofer asignado</Label>
        <Select
          value={choferId || SIN_ASIGNAR}
          onValueChange={(v) => setChoferId(v === SIN_ASIGNAR ? "" : v)}
        >
          <SelectTrigger><SelectValue placeholder="Sin asignar" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={SIN_ASIGNAR}>Sin asignar</SelectItem>
            {choferes.map((c) => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>Prioridad</Label>
        <Select value={prioridad} onValueChange={(v) => setPrioridad(v as Prioridad)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{PRIORIDADES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5"><Label>Ventana inicio</Label>
          <Input type="time" value={vi} onChange={(e) => setVi(e.target.value)} /></div>
        <div className="space-y-1.5"><Label>Ventana fin</Label>
          <Input type="time" value={vf} onChange={(e) => setVf(e.target.value)} /></div>
      </div>
      <div className="space-y-1.5 sm:col-span-2"><Label>Dirección de entrega</Label>
        <Input value={direccion} onChange={(e) => setDireccion(e.target.value)} /></div>
      <div className="space-y-1.5 sm:col-span-2"><Label>Notas</Label>
        <Textarea value={notas} onChange={(e) => setNotas(e.target.value)} /></div>
      {estatus === "no_entregado" && (
        <div className="space-y-1.5 sm:col-span-2"><Label>Motivo del problema</Label>
          <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Cliente no estaba, dirección incorrecta, etc." /></div>
      )}
      <div className="sm:col-span-2 flex justify-end">
        <Button onClick={save} disabled={pending}>{pending ? "Guardando…" : "Guardar cambios"}</Button>
      </div>
    </CardContent></Card>
  );
}
