"use client";

// Botón "Se terminó": marca un vino de muestra como producto terminado.
// Da de baja el remanente del banco y, si ya no queda stock en la zona,
// libera el candado de reuso (3 clientes) para poder volver a pedirlo.
// Se usa en el banco de muestras (por bucket) y en la ficha de la solicitud
// (todas las bodegas de la zona del vendedor dueño).

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PackageX } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function FinishSampleButton({
  productId,
  productName,
  supplier,
  region,
  location,
  available,
  allLocations = false,
}: {
  productId: string;
  productName: string;
  supplier?: string | null;
  region: string | null;
  // Bodega del bucket a dar de baja; se ignora si allLocations es true.
  location?: string | null;
  // Disponibles del bucket (solo informativo); null si no se conoce.
  available?: number | null;
  allLocations?: boolean;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();

  const confirm = () => {
    startTransition(async () => {
      const { data, error } = await supabase.rpc("sample_product_finish", {
        p_product: productId,
        p_region: region,
        p_location: allLocations ? null : (location ?? null),
        p_note: note || null,
        p_all_locations: allLocations,
      });
      if (error) {
        toast.error("No se pudo marcar como terminado", { description: error.message });
        return;
      }
      const r = (data ?? {}) as { baja?: number; liberadas?: number; region_disponible?: number };
      const restante = Number(r.region_disponible ?? 0);
      toast.success(`${productName}: producto terminado`, {
        description:
          restante > 0
            ? `Aún quedan ${restante} botella(s) en otra bodega de la zona; el candado sigue hasta terminarlas.`
            : "Se liberó el candado: ya se puede volver a pedir este vino.",
      });
      setOpen(false);
      setNote("");
      router.refresh();
    });
  };

  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        className="text-destructive hover:text-destructive"
        onClick={() => setOpen(true)}
        disabled={pending}
      >
        <PackageX className="mr-1 h-4 w-4" /> Se terminó
      </Button>
      <Dialog open={open} onOpenChange={(o) => !o && setOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Producto terminado</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="text-sm">
              <div className="font-medium">{productName}</div>
              <div className="text-muted-foreground">
                {[
                  supplier,
                  region ?? "Sin zona",
                  allLocations ? "todas las bodegas" : (location ?? "Sin bodega"),
                  available != null ? `${available} en el banco` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Las botellas de muestra ya se acabaron (se sirvieron o murieron abiertas). Esto da de
              baja lo que quede en el banco y, si ya no hay stock del vino en la zona, libera el
              candado para poder <strong>volver a pedirlo</strong>. No cuenta como toma ni afecta el
              % de encartes.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="finish_note">Nota (motivo)</Label>
              <Input
                id="finish_note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Se terminó en cata con…"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
                Cancelar
              </Button>
              <Button variant="destructive" onClick={confirm} disabled={pending}>
                {pending ? "Marcando…" : "Marcar terminado"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
