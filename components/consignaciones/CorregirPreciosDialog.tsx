"use client";

// Corrección manual de precios para consignaciones heredadas con $0.00.
// Las cantidades quedan fijas; el usuario captura el precio real por renglón
// y confirma viendo el total nuevo. Validación igual que la creación: todo
// precio > 0 (los renglones inválidos se marcan en rojo y bloquean el botón).
// El server (POST [id]/precios) re-valida, exige cero movimientos y deja nota
// de auditoría con total anterior → nuevo.

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { BadgeDollarSign } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import type { Base44ConsignacionItem } from "@/lib/base44";

type Props = {
  consignacionId: string;
  items: Base44ConsignacionItem[];
};

export function CorregirPreciosDialog({ consignacionId, items }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [precios, setPrecios] = useState<Record<string, number>>(() =>
    Object.fromEntries(items.map((it) => [it.producto_id, Number(it.precio_unitario) || 0])),
  );

  const filas = useMemo(
    () =>
      items.map((it) => {
        const precio = Number(precios[it.producto_id]) || 0;
        return {
          ...it,
          precioNuevo: precio,
          subtotalNuevo: Math.round(it.cantidad * precio * 100) / 100,
          invalido: !(precio > 0),
        };
      }),
    [items, precios],
  );
  const totalNuevo = Math.round(filas.reduce((s, f) => s + f.subtotalNuevo, 0) * 100) / 100;
  const valido = filas.length > 0 && filas.every((f) => !f.invalido) && totalNuevo > 0;

  const submit = () => {
    startTransition(async () => {
      const res = await fetch(`/api/consignaciones/${consignacionId}/precios`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          precios: filas.map((f) => ({ producto_id: f.producto_id, precio_unitario: f.precioNuevo })),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error("No se pudieron corregir los precios", { description: data.error ?? `HTTP ${res.status}` });
        return;
      }
      const data = (await res.json()) as { total: number };
      toast.success(`Precios corregidos — total nuevo ${formatCurrency(data.total)}`);
      setOpen(false);
      router.refresh();
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <BadgeDollarSign className="mr-1 h-3.5 w-3.5" />
          Corregir precios
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Corregir precios</DialogTitle>
          <DialogDescription>
            Captura el precio unitario real de cada producto. Las cantidades no cambian. El
            cambio queda registrado en las notas con el total anterior y el nuevo.
          </DialogDescription>
        </DialogHeader>

        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-1.5 text-left">Producto</th>
                <th className="px-3 py-1.5 text-right">Cant.</th>
                <th className="px-3 py-1.5 text-right w-32">Precio unit.</th>
                <th className="px-3 py-1.5 text-right">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.producto_id} className="border-t">
                  <td className="px-3 py-1.5">{f.producto_nombre}</td>
                  <td className="px-3 py-1.5 text-right">{f.cantidad}</td>
                  <td className="px-3 py-1.5 text-right">
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={f.precioNuevo}
                      onChange={(e) =>
                        setPrecios((prev) => ({ ...prev, [f.producto_id]: Number(e.target.value) }))
                      }
                      aria-invalid={f.invalido}
                      className={
                        f.invalido
                          ? "h-8 text-right border-destructive focus-visible:ring-destructive"
                          : "h-8 text-right"
                      }
                    />
                  </td>
                  <td className="px-3 py-1.5 text-right whitespace-nowrap">
                    {formatCurrency(f.subtotalNuevo)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t bg-muted/30 font-medium">
                <td className="px-3 py-1.5" colSpan={3}>Total nuevo</td>
                <td className="px-3 py-1.5 text-right">{formatCurrency(totalNuevo)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {!valido && (
          <p className="text-sm text-destructive" role="alert">
            Cada producto debe tener un precio unitario mayor a $0.00.
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={pending || !valido}>
            {pending ? "Guardando…" : `Guardar precios (${formatCurrency(totalNuevo)})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
