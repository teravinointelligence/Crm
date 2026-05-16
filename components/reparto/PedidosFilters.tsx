// Filtros del listado /reparto/pedidos. Empuja los cambios al URL.

"use client";

import { useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { PEDIDO_ESTATUS, ESTATUS_LABEL } from "@/types/reparto";

type Chofer = { id: string; nombre: string };

export function PedidosFilters({
  choferes,
  initial,
}: {
  choferes: Chofer[];
  initial: { estatus: string; chofer_id: string; fecha_from: string; fecha_to: string; q: string };
}) {
  const router = useRouter();
  const search = useSearchParams();
  const [, startTransition] = useTransition();

  const push = (patch: Record<string, string>) => {
    const u = new URLSearchParams(search.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === "" || v === "todos") u.delete(k);
      else u.set(k, v);
    }
    u.delete("page");
    startTransition(() => router.replace(`/reparto/pedidos?${u.toString()}`));
  };

  return (
    <Card><CardContent className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
      <div className="lg:col-span-2 space-y-1.5">
        <Label htmlFor="q">Buscar</Label>
        <div className="relative">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input id="q" defaultValue={initial.q} placeholder="Folio o UUID…" className="pl-9"
            onBlur={(e) => push({ q: e.target.value })}
            onKeyDown={(e) => { if (e.key === "Enter") push({ q: (e.target as HTMLInputElement).value }); }}
          />
        </div>
      </div>
      <div className="space-y-1.5"><Label>Estatus</Label>
        <Select value={initial.estatus} onValueChange={(v) => push({ estatus: v })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            {PEDIDO_ESTATUS.map((s) => <SelectItem key={s} value={s}>{ESTATUS_LABEL[s]}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5"><Label>Chofer</Label>
        <Select value={initial.chofer_id} onValueChange={(v) => push({ chofer_id: v })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="sin_asignar">Sin asignar</SelectItem>
            {choferes.map((c) => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-2 lg:col-span-1">
        <div className="space-y-1.5"><Label>Desde</Label>
          <Input type="date" defaultValue={initial.fecha_from} onChange={(e) => push({ fecha_from: e.target.value })} /></div>
        <div className="space-y-1.5"><Label>Hasta</Label>
          <Input type="date" defaultValue={initial.fecha_to} onChange={(e) => push({ fecha_to: e.target.value })} /></div>
      </div>
    </CardContent></Card>
  );
}
