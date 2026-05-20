"use client";

// Dialog para "facturar lo consumido" desde el detalle de una toma de inventario.
// Muestra el desglose por producto (anterior → contada = consumido × precio),
// el total a registrar como venta, y un campo opcional de cobro recibido.
// Al confirmar, llama a /api/consignaciones/tomas/[id]/facturar-consumo.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Receipt } from "lucide-react";
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
import type { Base44TomaInventario, Base44Consignacion } from "@/lib/base44";

type Props = {
  toma: Base44TomaInventario;
  /** Precios por producto desde la consignación vinculada (para valorizar). */
  consignacionItems: Pick<Base44Consignacion, "items">["items"];
};

export function FacturarConsumoDialog({ toma, consignacionItems }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [cobrado, setCobrado] = useState<number>(0);
  const [notas, setNotas] = useState("");

  // Desglose del consumo (mismo cálculo que el server, para preview).
  const precioById = new Map(
    (consignacionItems ?? []).map((i) => [i.producto_id, Number(i.precio_unitario) || 0]),
  );
  const detalle = (toma.items ?? [])
    .map((it) => {
      const anterior = Number(it.cantidad_anterior ?? 0);
      const contada = Number(it.cantidad_contada ?? 0);
      const consumido = Math.max(0, anterior - contada);
      const precio = it.producto_id ? precioById.get(it.producto_id) ?? 0 : 0;
      return {
        nombre: it.producto_nombre ?? "—",
        anterior,
        contada,
        consumido,
        precio,
        subtotal: Math.round(consumido * precio * 100) / 100,
      };
    })
    .filter((d) => d.consumido > 0);

  const totalUnidades = detalle.reduce((s, d) => s + d.consumido, 0);
  const totalValor = Math.round(detalle.reduce((s, d) => s + d.subtotal, 0) * 100) / 100;

  const yaFacturado = !!toma.consumo_facturado;
  const sinConsumo = totalUnidades === 0;

  const submit = () => {
    startTransition(async () => {
      const res = await fetch(`/api/consignaciones/tomas/${toma.id}/facturar-consumo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cobrado, notas: notas.trim() || undefined }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error("No se pudo facturar el consumo", { description: data.error ?? `HTTP ${res.status}` });
        return;
      }
      const data = (await res.json()) as { unidades: number; valor: number; warning?: string };
      toast.success(`Consumo facturado: ${data.unidades} unidades (${formatCurrency(data.valor)})`, {
        description: data.warning,
      });
      setOpen(false);
      router.refresh();
    });
  };

  if (yaFacturado) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
        <Receipt className="h-4 w-4" />
        Consumo ya facturado en la consignación.
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setCobrado(0); setNotas(""); } }}>
      <DialogTrigger asChild>
        <Button disabled={sinConsumo}>
          <Receipt className="mr-1 h-4 w-4" />
          Facturar consumo
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Facturar consumo</DialogTitle>
          <DialogDescription>
            Registra como venta en la consignación lo consumido desde la toma anterior
            (existencia anterior − contada). Esta acción solo se puede hacer una vez por toma.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {sinConsumo ? (
            <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              Esta toma no refleja consumo (las cantidades contadas no bajaron). No hay nada que facturar.
            </p>
          ) : (
            <>
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/30 text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-3 py-1.5 text-left">Producto</th>
                      <th className="px-3 py-1.5 text-right">Antes</th>
                      <th className="px-3 py-1.5 text-right">Contada</th>
                      <th className="px-3 py-1.5 text-right">Consumido</th>
                      <th className="px-3 py-1.5 text-right">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detalle.map((d, i) => (
                      <tr key={i} className="border-t">
                        <td className="px-3 py-1.5">{d.nombre}</td>
                        <td className="px-3 py-1.5 text-right">{d.anterior}</td>
                        <td className="px-3 py-1.5 text-right">{d.contada}</td>
                        <td className="px-3 py-1.5 text-right font-medium">{d.consumido}</td>
                        <td className="px-3 py-1.5 text-right">{formatCurrency(d.subtotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t bg-muted/30 font-medium">
                      <td className="px-3 py-1.5" colSpan={3}>Total</td>
                      <td className="px-3 py-1.5 text-right">{totalUnidades}</td>
                      <td className="px-3 py-1.5 text-right">{formatCurrency(totalValor)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              <div className="space-y-1">
                <Label htmlFor="cobrado">Cobro recibido en esta facturación (opcional)</Label>
                <Input
                  id="cobrado"
                  type="number"
                  min={0}
                  step="0.01"
                  value={cobrado}
                  onChange={(e) => setCobrado(Number(e.target.value))}
                  placeholder="0.00"
                />
                <p className="text-xs text-muted-foreground">
                  Las {totalUnidades} unidades se suman a "vendidas" en la consignación. El cobro es
                  el dinero que recibiste hoy (puede ser 0 si se cobra después).
                </p>
              </div>

              <div className="space-y-1">
                <Label htmlFor="notas">Notas (opcional)</Label>
                <Textarea id="notas" value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} />
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>Cancelar</Button>
          <Button onClick={submit} disabled={pending || sinConsumo}>
            {pending ? "Facturando…" : `Facturar ${totalUnidades} unidades`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
