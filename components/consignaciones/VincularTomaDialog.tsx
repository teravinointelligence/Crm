"use client";

// Dialog para vincular una toma de inventario huérfana a una consignación.
// Recibe las candidatas ya rankeadas desde el server (match-toma.ts) y SIEMPRE
// pide confirmación — la primera opción viene marcada como "Sugerida" pero el
// usuario elige. Llama a /api/consignaciones/tomas/[id]/vincular.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { formatCurrency, formatDate } from "@/lib/utils";

export type CandidataVinculo = {
  id: string;
  cliente_nombre: string;
  vendedor_nombre: string;
  fecha: string;
  estado: string;
  total: number;
  score: number;
  motivos: string[];
};

type Props = {
  tomaId: string;
  tomaLabel: string;
  candidatas: CandidataVinculo[];
};

export function VincularTomaDialog({ tomaId, tomaLabel, candidatas }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [seleccionada, setSeleccionada] = useState<string>("");

  const submit = () => {
    if (!seleccionada) return;
    startTransition(async () => {
      const res = await fetch(`/api/consignaciones/tomas/${tomaId}/vincular`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consignacion_id: seleccionada }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error("No se pudo vincular la toma", {
          description: data.error ?? `HTTP ${res.status}`,
        });
        return;
      }
      const data = (await res.json()) as { warning?: string };
      toast.success(`Toma ${tomaLabel} vinculada`, { description: data.warning });
      setOpen(false);
      router.refresh();
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setSeleccionada(""); }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Link2 className="mr-1 h-3.5 w-3.5" />
          Vincular
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Vincular toma a consignación</DialogTitle>
          <DialogDescription>
            La toma {tomaLabel} no tiene consignación vinculada. Elige la consignación
            correcta — revisa cliente, vendedor y fecha antes de confirmar (hay clientes
            duplicados en TERAVINO Flow).
          </DialogDescription>
        </DialogHeader>

        {candidatas.length === 0 ? (
          <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            No encontré consignaciones candidatas para este cliente. Verifica que la
            consignación exista y que el nombre del cliente coincida.
          </p>
        ) : (
          <ul className="max-h-72 space-y-2 overflow-y-auto">
            {candidatas.map((c, idx) => {
              const activa = seleccionada === c.id;
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => setSeleccionada(c.id)}
                    aria-pressed={activa}
                    className={`w-full rounded-md border p-3 text-left text-sm transition-colors ${
                      activa
                        ? "border-brand-carmesi bg-brand-carmesi/5 ring-1 ring-brand-carmesi"
                        : "hover:bg-muted/50"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium">{c.cliente_nombre}</p>
                      {idx === 0 && <Badge variant="accent">Sugerida</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(c.fecha)} · {c.vendedor_nombre} · {formatCurrency(c.total)} ·{" "}
                      {c.estado}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {c.motivos.join(" · ")}
                    </p>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={pending || !seleccionada}>
            {pending ? "Vinculando…" : "Vincular toma"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
