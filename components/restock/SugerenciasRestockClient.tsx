"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PackagePlus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { TableScroll } from "@/components/ui/table-scroll";

export type Suggestion = {
  product_id: string;
  sku: string | null;
  name: string;
  supplier: string | null;
  stock: number;
  velocityPerMonth: number;
  daysOfCover: number | null;
  leadDays: number;
  suggestedQty: number;
  orderByInDays: number | null;
  urgency: "agotado" | "critico" | "pronto" | "normal" | "sin_riesgo";
  reason: string;
};

const URGENCY: Record<Suggestion["urgency"], { label: string; variant: "danger" | "warning" | "accent" | "muted" }> = {
  agotado: { label: "Agotado", variant: "danger" },
  critico: { label: "Pedir ya", variant: "danger" },
  pronto: { label: "Pedir pronto", variant: "warning" },
  normal: { label: "En riesgo", variant: "accent" },
  sin_riesgo: { label: "OK", variant: "muted" },
};

export function SugerenciasRestockClient({ suggestions }: { suggestions: Suggestion[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set(suggestions.map((s) => s.product_id)));
  const [qty, setQty] = useState<Record<string, number>>(
    Object.fromEntries(suggestions.map((s) => [s.product_id, s.suggestedQty])),
  );
  const [done, setDone] = useState<Set<string>>(new Set());
  const [converting, setConverting] = useState<string | null>(null);

  // Agrupa por proveedor (para pedidos consolidados), ocultando los ya convertidos.
  const groups = useMemo(() => {
    const m = new Map<string, Suggestion[]>();
    for (const s of suggestions) {
      if (done.has(s.product_id)) continue;
      const key = s.supplier?.trim() || "Sin proveedor";
      (m.get(key) ?? m.set(key, []).get(key)!).push(s);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [suggestions, done]);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const toggleSupplier = (items: Suggestion[], on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const i of items) (on ? next.add(i.product_id) : next.delete(i.product_id));
      return next;
    });

  const convert = async (supplier: string, items: Suggestion[]) => {
    const chosen = items.filter((i) => selected.has(i.product_id) && (qty[i.product_id] ?? 0) > 0);
    if (!chosen.length) {
      toast.error("Selecciona al menos un producto con cantidad.");
      return;
    }
    setConverting(supplier);
    try {
      const res = await fetch("/api/restock/sugerencias/convertir", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          notes: `Sugerencias de reabasto · ${supplier}`,
          items: chosen.map((i) => ({
            product_id: i.product_id,
            name: i.name,
            supplier: i.supplier,
            quantity: qty[i.product_id] ?? i.suggestedQty,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo crear el pedido.");
      toast.success(`Pedido ${data.request_number} creado · entró a la bandeja de revisión.`);
      setDone((prev) => {
        const next = new Set(prev);
        chosen.forEach((i) => next.add(i.product_id));
        return next;
      });
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al crear el pedido.");
    } finally {
      setConverting(null);
    }
  };

  if (!groups.length) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Todas las sugerencias se convirtieron en pedidos. Revísalos en la bandeja.
        </CardContent>
      </Card>
    );
  }

  const totalAtRisk = groups.reduce((s, [, items]) => s + items.length, 0);

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        <span className="font-medium text-foreground">{totalAtRisk}</span> productos en riesgo ·{" "}
        <span className="font-medium text-foreground">{groups.length}</span> proveedores
      </p>

      {groups.map(([supplier, items]) => {
        const selCount = items.filter((i) => selected.has(i.product_id)).length;
        const allOn = selCount === items.length;
        const totalUnits = items
          .filter((i) => selected.has(i.product_id))
          .reduce((s, i) => s + (qty[i.product_id] ?? 0), 0);
        return (
          <Card key={supplier}>
            <CardContent className="space-y-3 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-display text-xl">{supplier}</h2>
                  <p className="text-xs text-muted-foreground">
                    {items.length} productos · {selCount} seleccionados · {totalUnits} unidades
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" onClick={() => toggleSupplier(items, !allOn)}>
                    {allOn ? "Quitar todos" : "Seleccionar todos"}
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => convert(supplier, items)}
                    disabled={converting === supplier || !selCount}
                  >
                    {converting === supplier ? (
                      <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                    ) : (
                      <PackagePlus className="mr-1 h-4 w-4" />
                    )}
                    Crear pedido de restock
                  </Button>
                </div>
              </div>

              <TableScroll>
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="w-8 px-2 py-2"></th>
                      <th className="px-2 py-2">Producto</th>
                      <th className="px-2 py-2">Urgencia</th>
                      <th className="px-2 py-2 text-right">Vende/mes</th>
                      <th className="px-2 py-2 text-right">Stock</th>
                      <th className="px-2 py-2 text-right">Cobertura</th>
                      <th className="px-2 py-2 text-right">Pedir</th>
                      <th className="px-2 py-2 text-right w-24">Cantidad</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((i) => {
                      const u = URGENCY[i.urgency];
                      const isSel = selected.has(i.product_id);
                      return (
                        <tr key={i.product_id} className={`border-b last:border-0 align-top ${isSel ? "bg-accent/10" : ""}`}>
                          <td className="px-2 py-2">
                            <input
                              type="checkbox"
                              className="mt-1 h-4 w-4 accent-brand-carmesi"
                              checked={isSel}
                              onChange={() => toggle(i.product_id)}
                            />
                          </td>
                          <td className="px-2 py-2">
                            <div className="font-medium">{i.name}</div>
                            <div className="text-xs text-muted-foreground">{i.reason}</div>
                          </td>
                          <td className="px-2 py-2">
                            <Badge variant={u.variant}>{u.label}</Badge>
                          </td>
                          <td className="px-2 py-2 text-right">{i.velocityPerMonth}</td>
                          <td className="px-2 py-2 text-right">{i.stock}</td>
                          <td className="px-2 py-2 text-right">{i.daysOfCover == null ? "—" : `${i.daysOfCover}d`}</td>
                          <td className="px-2 py-2 text-right">
                            {i.orderByInDays == null
                              ? "—"
                              : i.orderByInDays <= 0
                                ? "ya"
                                : `${i.orderByInDays}d`}
                          </td>
                          <td className="px-2 py-2 text-right">
                            <Input
                              type="number"
                              min={0}
                              value={qty[i.product_id] ?? 0}
                              onChange={(e) =>
                                setQty((p) => ({ ...p, [i.product_id]: Math.max(0, Number(e.target.value) || 0) }))
                              }
                              className="h-8 w-20 text-right"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </TableScroll>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
