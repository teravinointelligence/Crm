"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatCurrency } from "@/lib/utils";
import type { Base44Producto } from "@/lib/base44";

type LineItem = {
  key: string;
  producto_id: string;
  producto_nombre: string;
  cantidad: number;
  precio_unitario: number;
};

export function AgregarProductoDialog({
  consignacionId,
  productos,
  etiquetasActuales = 0,
}: {
  consignacionId: string;
  productos: Base44Producto[];
  etiquetasActuales?: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<LineItem[]>([]);
  const [pending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return productos.slice(0, 20);
    const tokens = q.split(/\s+/);
    return productos
      .filter((p) => {
        const hay = [p.nombre, p.bodega, p.codigo, p.tipo].filter(Boolean).join(" ").toLowerCase();
        return tokens.every((t) => hay.includes(t));
      })
      .slice(0, 60);
  }, [productos, query]);

  function addProduct(p: Base44Producto) {
    setItems((prev) => [
      ...prev,
      {
        key: `${p.id}-${Date.now()}`,
        producto_id: p.id,
        producto_nombre: p.nombre,
        cantidad: 1,
        precio_unitario: Number(p.precio_unitario ?? 0),
      },
    ]);
    setQuery("");
    if (!(Number(p.precio_unitario) > 0)) {
      toast.warning(`"${p.nombre}" no tiene precio en el catálogo`, {
        description: "Captura el precio unitario en el renglón.",
      });
    }
  }

  function removeItem(key: string) {
    setItems((prev) => prev.filter((i) => i.key !== key));
  }

  function updateItem(key: string, patch: Partial<LineItem>) {
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, ...patch } : i)));
  }

  const total = items.reduce(
    (s, i) => s + (Number(i.cantidad) || 0) * (Number(i.precio_unitario) || 0),
    0,
  );

  const nuevasEtiquetas = items.reduce((s, i) => s + (Number(i.cantidad) || 0), 0);
  const totalEtiquetasResultante = etiquetasActuales + nuevasEtiquetas;

  const canSubmit =
    items.length > 0 &&
    items.every((i) => i.cantidad > 0 && i.precio_unitario > 0);

  function handleOpen() {
    setItems([]);
    setQuery("");
    setOpen(true);
  }

  function handleClose() {
    setOpen(false);
    setItems([]);
    setQuery("");
  }

  function submit() {
    if (!canSubmit) return;
    startTransition(async () => {
      const res = await fetch(`/api/consignaciones/${consignacionId}/productos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: items.map((i) => ({
            producto_id: i.producto_id,
            producto_nombre: i.producto_nombre,
            cantidad: Number(i.cantidad),
            precio_unitario: Number(i.precio_unitario),
          })),
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error("Error al agregar productos", { description: data.error ?? `HTTP ${res.status}` });
        return;
      }

      toast.success(
        items.length === 1
          ? "Producto agregado"
          : `${items.length} productos agregados`,
      );
      handleClose();
      router.refresh();
    });
  }

  return (
    <>
      <Button size="sm" onClick={handleOpen}>
        <Plus className="mr-1 h-4 w-4" /> Agregar producto
      </Button>

      <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Agregar productos a la consignación</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Buscador de productos */}
            <div className="space-y-1.5">
              <Label>Buscar producto</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-8"
                  placeholder="Nombre, bodega, código…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
              {query.trim() && (
                <div className="max-h-48 overflow-y-auto rounded-md border bg-popover text-sm shadow-md">
                  {filtered.length === 0 ? (
                    <p className="px-3 py-2 text-muted-foreground">Sin resultados</p>
                  ) : (
                    filtered.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-accent"
                        onClick={() => addProduct(p)}
                      >
                        <span>
                          <span className="font-medium">{p.nombre}</span>
                          {p.bodega && (
                            <span className="ml-2 text-xs text-muted-foreground">{p.bodega}</span>
                          )}
                        </span>
                        <span className="ml-4 shrink-0 text-xs text-muted-foreground">
                          {Number(p.precio_unitario) > 0
                            ? formatCurrency(p.precio_unitario)
                            : "Sin precio"}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Renglones seleccionados */}
            {items.length > 0 && (
              <div className="space-y-2">
                <div className="grid grid-cols-[1fr_80px_110px_32px] gap-2 text-xs font-medium uppercase text-muted-foreground">
                  <span>Producto</span>
                  <span className="text-right">Cant.</span>
                  <span className="text-right">Precio unit.</span>
                  <span />
                </div>
                {items.map((it) => (
                  <div
                    key={it.key}
                    className="grid grid-cols-[1fr_80px_110px_32px] items-center gap-2"
                  >
                    <span className="truncate text-sm">{it.producto_nombre}</span>
                    <Input
                      type="number"
                      min={1}
                      className="text-right"
                      value={it.cantidad}
                      onChange={(e) =>
                        updateItem(it.key, { cantidad: Number(e.target.value) })
                      }
                    />
                    <Input
                      type="number"
                      min={0}
                      step={0.01}
                      className="text-right"
                      value={it.precio_unitario}
                      onChange={(e) =>
                        updateItem(it.key, { precio_unitario: Number(e.target.value) })
                      }
                    />
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => removeItem(it.key)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <div className="flex justify-end pt-1 text-sm font-medium">
                  Total a agregar: {formatCurrency(total)}
                </div>
              </div>
            )}

            {items.length > 0 && (
              <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                Total: {totalEtiquetasResultante} etiquetas
              </div>
            )}

            <div className="flex justify-end gap-2 border-t pt-3">
              <Button variant="outline" onClick={handleClose}>
                Cancelar
              </Button>
              <Button disabled={!canSubmit || pending} onClick={submit}>
                {pending ? "Guardando…" : "Guardar"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
