"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Wine } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";

export type WineRow = {
  id: string;
  wine_name: string;
  winery: string | null;
  vintage: string | null;
  bottle_count: number;
  pairing_order: number | null;
  notes: string | null;
};

export function EventWines({
  eventId,
  wines,
  canManage,
}: {
  eventId: string;
  wines: WineRow[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ wine_name: "", winery: "", vintage: "", bottle_count: "6" });

  const add = () => {
    if (!f.wine_name.trim()) return void toast.error("Falta el nombre del vino.");
    startTransition(async () => {
      const supabase = createClient();
      const { error } = await supabase.from("event_wines").insert({
        event_id: eventId,
        wine_name: f.wine_name.trim(),
        winery: f.winery.trim() || null,
        vintage: f.vintage.trim() || null,
        bottle_count: Number(f.bottle_count) || 1,
        pairing_order: wines.length + 1,
      });
      if (error) return void toast.error("No se pudo agregar", { description: error.message });
      toast.success("Vino agregado");
      setF({ wine_name: "", winery: "", vintage: "", bottle_count: "6" });
      setAdding(false);
      router.refresh();
    });
  };

  const remove = (id: string) => {
    startTransition(async () => {
      const supabase = createClient();
      const { error } = await supabase.from("event_wines").delete().eq("id", id);
      if (error) return void toast.error("No se pudo eliminar", { description: error.message });
      router.refresh();
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl">Vinos del maridaje</h2>
        {canManage && !adding && (
          <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
            <Plus className="mr-1 h-4 w-4" /> Agregar vino
          </Button>
        )}
      </div>

      {wines.length === 0 && !adding ? (
        <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
          Sin vinos en la lista.
        </p>
      ) : (
        <ul className="space-y-2">
          {wines.map((w) => (
            <li key={w.id} className="flex items-center justify-between rounded-lg border bg-card p-3">
              <div className="flex items-center gap-2">
                <Wine className="h-4 w-4 text-brand-carmesi" />
                <div>
                  <p className="font-medium">
                    {w.wine_name}
                    {w.vintage ? ` ${w.vintage}` : ""}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {w.winery ? `${w.winery} · ` : ""}
                    {w.bottle_count} botella(s)
                  </p>
                </div>
              </div>
              {canManage && (
                <Button size="icon" variant="ghost" onClick={() => remove(w.id)} disabled={pending}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {adding && (
        <div className="grid grid-cols-2 gap-2 rounded-lg border p-3 sm:grid-cols-4">
          <Input
            placeholder="Vino *"
            value={f.wine_name}
            onChange={(e) => setF({ ...f, wine_name: e.target.value })}
          />
          <Input
            placeholder="Bodega"
            value={f.winery}
            onChange={(e) => setF({ ...f, winery: e.target.value })}
          />
          <Input
            placeholder="Añada"
            value={f.vintage}
            onChange={(e) => setF({ ...f, vintage: e.target.value })}
          />
          <Input
            type="number"
            min={1}
            placeholder="Botellas"
            value={f.bottle_count}
            onChange={(e) => setF({ ...f, bottle_count: e.target.value })}
          />
          <div className="col-span-2 flex gap-2 sm:col-span-4">
            <Button size="sm" onClick={add} disabled={pending}>
              Guardar
            </Button>
            <Button size="sm" variant="outline" onClick={() => setAdding(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
