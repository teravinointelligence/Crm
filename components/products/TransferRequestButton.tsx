"use client";

// Botón "Transferir" en una fila del catálogo. Abre un diálogo para que el
// vendedor solicite mover unidades de un almacén a otro. Queda pendiente de
// aprobación por admin (tabla warehouse_transfer_requests, RLS).

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeftRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { WAREHOUSES } from "@/lib/warehouses";

export function TransferRequestButton({
  productId,
  productName,
  stockByWarehouse = {},
}: {
  productId: string;
  productName: string;
  stockByWarehouse?: Record<string, number>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  // Almacén origen sugerido: el que tenga más existencia.
  const defaultFrom = useMemo(() => {
    const withStock = WAREHOUSES.filter((w) => (stockByWarehouse[w] ?? 0) > 0);
    if (withStock.length === 0) return WAREHOUSES[0];
    return withStock.sort((a, b) => (stockByWarehouse[b] ?? 0) - (stockByWarehouse[a] ?? 0))[0];
  }, [stockByWarehouse]);

  const [from, setFrom] = useState<string>(defaultFrom);
  const [to, setTo] = useState<string>(WAREHOUSES.find((w) => w !== defaultFrom) ?? WAREHOUSES[1]);
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState("");

  const available = stockByWarehouse[from] ?? 0;

  const submit = () => {
    if (from === to) {
      toast.error("El almacén origen y destino deben ser distintos");
      return;
    }
    const q = Number(qty);
    if (!q || q <= 0) {
      toast.error("Indica una cantidad válida");
      return;
    }
    startTransition(async () => {
      const res = await fetch("/api/catalogo/transferencias", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId,
          productLabel: productName,
          fromWarehouse: from,
          toWarehouse: to,
          quantity: q,
          reason: reason.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("No se pudo crear la solicitud", { description: data.error ?? `HTTP ${res.status}` });
        return;
      }
      toast.success("Solicitud de transferencia enviada", {
        description: data.notified ? "Se avisó a admin para aprobarla." : "Queda pendiente de aprobación por admin.",
      });
      setOpen(false);
      setQty("");
      setReason("");
      router.refresh();
    });
  };

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)} title="Solicitar transferencia entre almacenes">
        <ArrowLeftRight className="mr-1 h-3.5 w-3.5" /> Transferir
      </Button>

      <Dialog open={open} onOpenChange={(o) => !o && setOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Solicitar transferencia</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">{productName}</p>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>De (origen)</Label>
                <Select value={from} onValueChange={setFrom}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {WAREHOUSES.map((w) => (
                      <SelectItem key={w} value={w}>
                        {w} {stockByWarehouse[w] != null ? `(${stockByWarehouse[w]})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>A (destino)</Label>
                <Select value={to} onValueChange={setTo}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {WAREHOUSES.map((w) => (
                      <SelectItem key={w} value={w}>
                        {w}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="qty">Cantidad (botellas)</Label>
              <Input
                id="qty"
                type="number"
                min={1}
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                placeholder="ej. 6"
              />
              <p className="text-xs text-muted-foreground">
                Disponible en {from}: <strong>{available}</strong>
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="reason">Motivo (opcional)</Label>
              <Textarea
                id="reason"
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="ej. Pedido de cliente Hotel X en La Paz"
              />
            </div>

            <div className="flex justify-end gap-2 border-t pt-3">
              <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
                Cancelar
              </Button>
              <Button onClick={submit} disabled={pending}>
                {pending ? "Enviando…" : "Enviar solicitud"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
