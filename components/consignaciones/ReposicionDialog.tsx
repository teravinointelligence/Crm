"use client";

// Dialog para "solicitar reposición" desde el detalle de una consignación.
// Crea un pedido en el módulo de Reparto (pendiente de asignar chofer) con los
// productos a resurtir. Por defecto propone los items de la consignación.

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Truck, Search, Trash2, Plus } from "lucide-react";
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

type RepartoCliente = { id: string; nombre: string; rfc: string | null; ciudad: string | null };
type Line = { key: string; descripcion: string; cantidad: number; valor_unitario: number };

export function ReposicionDialog({ consignacion }: { consignacion: Base44Consignacion }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const [clienteQuery, setClienteQuery] = useState(consignacion.cliente_nombre ?? "");
  const [clientes, setClientes] = useState<RepartoCliente[]>([]);
  const [clienteId, setClienteId] = useState("");
  const [searching, setSearching] = useState(false);
  const [prioridad, setPrioridad] = useState<"normal" | "alta" | "urgente">("normal");
  const [notas, setNotas] = useState("");
  const [lines, setLines] = useState<Line[]>(
    (consignacion.items ?? []).map((i) => ({
      key: crypto.randomUUID(),
      descripcion: i.producto_nombre,
      cantidad: i.cantidad,
      valor_unitario: i.precio_unitario,
    })),
  );

  // Búsqueda de clientes de Reparto (debounce simple por dependencia).
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/consignaciones/reparto-clientes?q=${encodeURIComponent(clienteQuery)}`);
        if (!res.ok) return;
        const { data } = (await res.json()) as { data: RepartoCliente[] };
        if (!cancelled) setClientes(data);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [open, clienteQuery]);

  const cliente = clientes.find((c) => c.id === clienteId);

  const updateLine = (key: string, patch: Partial<Line>) =>
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const removeLine = (key: string) => setLines((prev) => prev.filter((l) => l.key !== key));
  const addLine = () =>
    setLines((prev) => [...prev, { key: crypto.randomUUID(), descripcion: "", cantidad: 1, valor_unitario: 0 }]);

  const validLines = lines.filter((l) => l.descripcion.trim() && l.cantidad > 0);
  const total = validLines.reduce((s, l) => s + l.cantidad * l.valor_unitario, 0);
  const canSubmit = !!clienteId && validLines.length > 0;

  const submit = () => {
    startTransition(async () => {
      const res = await fetch(`/api/consignaciones/${consignacion.id}/reposicion`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reparto_cliente_id: clienteId,
          prioridad,
          notas: notas.trim() || undefined,
          productos: validLines.map((l) => ({
            descripcion: l.descripcion.trim(),
            cantidad: l.cantidad,
            valor_unitario: l.valor_unitario,
          })),
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.error("No se pudo solicitar reposición", { description: d.error ?? `HTTP ${res.status}` });
        return;
      }
      const d = (await res.json()) as { numero_factura: string };
      toast.success(`Reposición creada en Reparto (${d.numero_factura})`, {
        description: "El pedido quedó registrado en el módulo de Reparto.",
      });
      setOpen(false);
      router.refresh();
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Truck className="mr-1 h-4 w-4" />
          Solicitar reposición
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Solicitar reposición</DialogTitle>
          <DialogDescription>
            Crea un pedido en el módulo de Reparto para resurtir producto.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Cliente Reparto */}
          <div className="space-y-2">
            <Label>Cliente destino (Reparto)</Label>
            {cliente ? (
              <div className="flex items-center justify-between rounded-md border bg-muted/30 p-3 text-sm">
                <div>
                  <p className="font-medium">{cliente.nombre}</p>
                  <p className="text-xs text-muted-foreground">{cliente.ciudad ?? "—"}{cliente.rfc ? ` · ${cliente.rfc}` : ""}</p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setClienteId("")}>Cambiar</Button>
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar cliente en Reparto..."
                    value={clienteQuery}
                    onChange={(e) => setClienteQuery(e.target.value)}
                    className="pl-8"
                  />
                </div>
                <div className="max-h-40 overflow-y-auto rounded-md border">
                  {searching ? (
                    <p className="p-3 text-xs text-muted-foreground">Buscando…</p>
                  ) : clientes.length === 0 ? (
                    <p className="p-3 text-xs text-muted-foreground">
                      Sin resultados. Da de alta el cliente en <em>/reparto</em> si no existe.
                    </p>
                  ) : (
                    <ul className="divide-y text-sm">
                      {clientes.map((c) => (
                        <li key={c.id}>
                          <button
                            type="button"
                            onClick={() => setClienteId(c.id)}
                            className="flex w-full flex-col items-start px-3 py-2 text-left hover:bg-muted/50"
                          >
                            <span className="font-medium">{c.nombre}</span>
                            <span className="text-xs text-muted-foreground">{c.ciudad ?? "—"}{c.rfc ? ` · ${c.rfc}` : ""}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Productos */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Productos a reponer</Label>
              <Button variant="ghost" size="sm" onClick={addLine}><Plus className="mr-1 h-3.5 w-3.5" />Agregar</Button>
            </div>
            <div className="space-y-2">
              {lines.map((l) => (
                <div key={l.key} className="flex items-center gap-2">
                  <Input
                    placeholder="Producto"
                    value={l.descripcion}
                    onChange={(e) => updateLine(l.key, { descripcion: e.target.value })}
                    className="flex-1"
                  />
                  <Input
                    type="number"
                    min={1}
                    value={l.cantidad}
                    onChange={(e) => updateLine(l.key, { cantidad: Number(e.target.value) })}
                    className="w-20 text-right"
                    aria-label="Cantidad"
                  />
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={l.valor_unitario}
                    onChange={(e) => updateLine(l.key, { valor_unitario: Number(e.target.value) })}
                    className="w-28 text-right"
                    aria-label="Valor unitario"
                  />
                  <Button variant="ghost" size="icon" onClick={() => removeLine(l.key)} aria-label="Quitar">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
            <p className="text-right text-sm text-muted-foreground">
              Subtotal: <strong>{formatCurrency(total)}</strong> · Total c/IVA: <strong>{formatCurrency(total * 1.16)}</strong>
            </p>
          </div>

          {/* Prioridad + notas */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Prioridad</Label>
              <Select value={prioridad} onValueChange={(v) => setPrioridad(v as typeof prioridad)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="alta">Alta</SelectItem>
                  <SelectItem value="urgente">Urgente</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="notas-rep">Notas</Label>
              <Textarea id="notas-rep" value={notas} onChange={(e) => setNotas(e.target.value)} rows={1} />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>Cancelar</Button>
          <Button onClick={submit} disabled={pending || !canSubmit}>
            {pending ? "Creando…" : "Crear reposición"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
