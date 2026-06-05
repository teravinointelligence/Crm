"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FlaskConical, PackageCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type BankRow = {
  product_id: string;
  product_name: string;
  supplier: string | null;
  region: string | null;
  available: number;
  ingresado: number;
  tomado: number;
};

export function SampleBankClient({
  rows,
  isAdmin,
}: {
  rows: BankRow[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [pending, startTransition] = useTransition();
  const [take, setTake] = useState<BankRow | null>(null);
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState("");

  const openTake = (r: BankRow) => {
    setTake(r);
    setQty(1);
    setNote("");
  };

  const confirmTake = () => {
    if (!take) return;
    if (qty <= 0 || qty > take.available) {
      toast.error("Cantidad inválida");
      return;
    }
    startTransition(async () => {
      const { error } = await supabase.rpc("sample_bank_take", {
        p_product: take.product_id,
        p_region: take.region,
        p_qty: qty,
        p_note: note || null,
      });
      if (error) {
        toast.error("No se pudo tomar la muestra", { description: error.message });
        return;
      }
      toast.success(`Tomaste ${qty} × ${take.product_name}`);
      setTake(null);
      router.refresh();
    });
  };

  if (!rows.length) {
    return (
      <EmptyState
        icon={FlaskConical}
        title="Banco vacío"
        description={
          isAdmin
            ? "Cuando autorices (apruebes) una solicitud de muestras, sus botellas aparecerán aquí, en la zona del vendedor."
            : "Por ahora no hay muestras disponibles en tu zona."
        }
      />
    );
  }

  const byRegion = new Map<string, BankRow[]>();
  for (const r of rows) {
    const key = r.region ?? "Sin zona";
    if (!byRegion.has(key)) byRegion.set(key, []);
    byRegion.get(key)!.push(r);
  }

  return (
    <div className="space-y-6">
      {[...byRegion.entries()].map(([region, list]) => (
        <Card key={region}>
          <CardContent className="p-0">
            {isAdmin && (
              <div className="border-b px-4 py-2 text-sm font-medium">Zona: {region}</div>
            )}
            <table className="min-w-full text-sm">
              <thead className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Vino</th>
                  <th className="px-4 py-3">Bodega</th>
                  <th className="px-4 py-3 text-right">Disponibles</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {list.map((r) => (
                  <tr key={`${r.product_id}-${r.region ?? "none"}`} className="border-b last:border-b-0">
                    <td className="px-4 py-3 font-medium">{r.product_name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{r.supplier ?? "—"}</td>
                    <td className="px-4 py-3 text-right">
                      <Badge variant="success">{r.available}</Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button size="sm" variant="outline" onClick={() => openTake(r)} disabled={pending}>
                        <PackageCheck className="mr-1 h-4 w-4" /> Tomar
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ))}

      <Dialog open={!!take} onOpenChange={(o) => !o && setTake(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tomar muestra</DialogTitle>
          </DialogHeader>
          {take && (
            <div className="space-y-4">
              <div className="text-sm">
                <div className="font-medium">{take.product_name}</div>
                <div className="text-muted-foreground">
                  {[take.supplier, take.region ?? "Sin zona", `${take.available} disponibles`].filter(Boolean).join(" · ")}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bank_qty">Cantidad</Label>
                <Input
                  id="bank_qty"
                  type="number"
                  min={1}
                  max={take.available}
                  value={qty}
                  onChange={(e) => setQty(Number(e.target.value) || 0)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bank_note">Nota (¿para qué cliente / cita?)</Label>
                <Input
                  id="bank_note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Cata en…"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setTake(null)} disabled={pending}>
                  Cancelar
                </Button>
                <Button onClick={confirmTake} disabled={pending}>
                  {pending ? "Tomando…" : "Tomar"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
