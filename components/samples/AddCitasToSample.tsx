"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";
import { cn, formatDateTime } from "@/lib/utils";

type Cita = {
  id: string;
  activity_date: string;
  activity_type: string;
  account_id: string | null;
  account_name: string | null;
  client_number: string | null;
};

// Clientes distintos que debe cubrir una muestra para liberar el vino.
const META = 3;

export function AddCitasToSample({
  requestId,
  citas,
  linkedAccountIds,
}: {
  requestId: string;
  citas: Cita[];
  linkedAccountIds: string[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<string[]>([]);

  const citaById = useMemo(() => new Map(citas.map((c) => [c.id, c])), [citas]);
  const current = useMemo(() => new Set(linkedAccountIds).size, [linkedAccountIds]);
  const projected = useMemo(() => {
    const s = new Set(linkedAccountIds);
    selected.forEach((id) => {
      const a = citaById.get(id)?.account_id;
      if (a) s.add(a);
    });
    return s.size;
  }, [selected, citaById, linkedAccountIds]);

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const addCitas = () => {
    if (!selected.length) return;
    startTransition(async () => {
      const { error } = await supabase
        .from("sample_request_activities")
        .insert(selected.map((activity_id) => ({ request_id: requestId, activity_id })));
      if (error) { toast.error("No se pudieron agregar las citas", { description: error.message }); return; }
      toast.success("Citas agregadas");
      setSelected([]);
      router.refresh();
    });
  };

  return (
    <Card><CardContent className="space-y-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-display text-lg">Registrar uso de la muestra</h3>
          <p className="text-sm text-muted-foreground">Suma las citas donde usaste esta muestra. Al llegar a {META} clientes distintos, el vino se libera para volver a pedirse.</p>
        </div>
        <span className={cn(
          "inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-medium",
          current >= META ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800",
        )}>
          <Users className="h-4 w-4" /> {current}/{META}
        </span>
      </div>

      {current >= META ? (
        <p className="rounded-md bg-green-50 p-3 text-sm text-green-800">✓ Esta muestra ya cubre {current} clientes — el vino está liberado para volver a pedirse.</p>
      ) : citas.length === 0 ? (
        <div className="rounded-md border border-dashed bg-muted/20 p-4 text-center text-sm text-muted-foreground">
          No hay más citas para agregar. Agenda visitas en Actividades y vuelve aquí.
        </div>
      ) : (
        <>
          <div className="grid max-h-64 gap-2 overflow-y-auto rounded-md border bg-muted/20 p-2 sm:grid-cols-2">
            {citas.map((c) => {
              const on = selected.includes(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => toggle(c.id)}
                  className={cn(
                    "flex items-start gap-2 rounded-md border bg-card p-2 text-left text-sm hover:border-brand-carmesi",
                    on && "border-brand-carmesi ring-1 ring-brand-carmesi",
                  )}
                >
                  <span className={cn(
                    "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                    on ? "bg-brand-carmesi text-white" : "border-input",
                  )}>
                    {on && <Check className="h-3 w-3" />}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{c.account_name ?? "Sin cliente"}{c.client_number ? ` · #${c.client_number}` : ""}</span>
                    <span className="block text-xs text-muted-foreground">{formatDateTime(c.activity_date)} · {c.activity_type}</span>
                  </span>
                </button>
              );
            })}
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">{selected.length > 0 ? `Quedará en ${projected}/${META} clientes` : "Selecciona las citas a sumar"}</span>
            <Button size="sm" onClick={addCitas} disabled={pending || !selected.length}>{pending ? "Agregando…" : "Agregar citas"}</Button>
          </div>
        </>
      )}
    </CardContent></Card>
  );
}
