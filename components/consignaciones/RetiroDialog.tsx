"use client";

// Dialog para registrar un retiro de consignación: el vendedor selecciona los
// productos que el cliente solicitó retirar, con cantidad y motivo. Al guardar
// crea el retiro en Base44 y ofrece descargar el PDF.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PackageX, Plus, Trash2, FileDown } from "lucide-react";
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
import type { Base44Consignacion } from "@/lib/base44";

type Line = {
  key: string;
  producto_id?: string;
  producto_nombre: string;
  codigo?: string;
  cantidad: number;
  motivo: string;
};

const today = () => new Date().toISOString().slice(0, 10);

export function RetiroDialog({ consignacion }: { consignacion: Base44Consignacion }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [fecha, setFecha] = useState(today());
  const [notas, setNotas] = useState("");
  const [createdId, setCreatedId] = useState<string | null>(null);
  // Pre-llena con los productos de la consignación (cantidad 0 = no se retira).
  const [lines, setLines] = useState<Line[]>(
    (consignacion.items ?? []).map((i) => ({
      key: crypto.randomUUID(),
      producto_id: i.producto_id,
      producto_nombre: i.producto_nombre,
      cantidad: 0,
      motivo: "",
    })),
  );

  const update = (key: string, patch: Partial<Line>) =>
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const remove = (key: string) => setLines((prev) => prev.filter((l) => l.key !== key));
  const addBlank = () =>
    setLines((prev) => [...prev, { key: crypto.randomUUID(), producto_nombre: "", cantidad: 1, motivo: "" }]);

  const valid = lines.filter((l) => l.producto_nombre.trim() && l.cantidad > 0);
  const totalUnidades = valid.reduce((s, l) => s + l.cantidad, 0);

  const reset = () => {
    setFecha(today());
    setNotas("");
    setCreatedId(null);
    setLines(
      (consignacion.items ?? []).map((i) => ({
        key: crypto.randomUUID(),
        producto_id: i.producto_id,
        producto_nombre: i.producto_nombre,
        cantidad: 0,
        motivo: "",
      })),
    );
  };

  const submit = () => {
    if (!valid.length) {
      toast.error("Marca al menos un producto con cantidad a retirar");
      return;
    }
    startTransition(async () => {
      const res = await fetch(`/api/consignaciones/${consignacion.id}/retiro`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fecha,
          notas: notas.trim() || undefined,
          items: valid.map((l) => ({
            producto_id: l.producto_id,
            producto_nombre: l.producto_nombre.trim(),
            codigo: l.codigo,
            cantidad: l.cantidad,
            motivo: l.motivo.trim() || undefined,
          })),
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.error("No se pudo registrar el retiro", { description: d.error ?? `HTTP ${res.status}` });
        return;
      }
      const d = (await res.json()) as { id: string; numero_retiro: string };
      toast.success(`Retiro ${d.numero_retiro} registrado`);
      setCreatedId(d.id);
      router.refresh();
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <PackageX className="mr-1 h-4 w-4" />
          Retiro de consignación
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Retiro de consignación</DialogTitle>
          <DialogDescription>
            Registra los productos que el cliente solicitó retirar. Genera un documento PDF para firma.
          </DialogDescription>
        </DialogHeader>

        {createdId ? (
          <div className="space-y-4">
            <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
              Retiro registrado. Puedes descargar el PDF para firma del cliente.
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" asChild>
                <a href={`/api/consignaciones/retiros/${createdId}/pdf`} target="_blank" rel="noreferrer">
                  <FileDown className="mr-1 h-4 w-4" /> Descargar PDF
                </a>
              </Button>
              <Button onClick={() => { setOpen(false); reset(); }}>Listo</Button>
            </div>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="ret_fecha">Fecha del retiro</Label>
                <Input id="ret_fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="w-48" />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Productos a retirar</Label>
                  <Button variant="ghost" size="sm" onClick={addBlank}><Plus className="mr-1 h-3.5 w-3.5" />Otro producto</Button>
                </div>
                <div className="max-h-72 space-y-2 overflow-y-auto">
                  {lines.map((l) => (
                    <div key={l.key} className="flex items-center gap-2">
                      <Input
                        placeholder="Producto"
                        value={l.producto_nombre}
                        onChange={(e) => update(l.key, { producto_nombre: e.target.value })}
                        className="flex-1"
                      />
                      <Input
                        type="number"
                        min={0}
                        value={l.cantidad}
                        onChange={(e) => update(l.key, { cantidad: Number(e.target.value) })}
                        className="w-20 text-right"
                        aria-label="Cantidad"
                      />
                      <Input
                        placeholder="Motivo"
                        value={l.motivo}
                        onChange={(e) => update(l.key, { motivo: e.target.value })}
                        className="w-40"
                      />
                      <Button variant="ghost" size="icon" onClick={() => remove(l.key)} aria-label="Quitar">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
                <p className="text-right text-sm text-muted-foreground">
                  Total a retirar: <strong>{totalUnidades}</strong> unidades
                </p>
              </div>

              <div className="space-y-1">
                <Label htmlFor="ret_notas">Notas</Label>
                <Textarea id="ret_notas" value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>Cancelar</Button>
              <Button onClick={submit} disabled={pending || !valid.length}>
                {pending ? "Registrando…" : "Registrar retiro"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
