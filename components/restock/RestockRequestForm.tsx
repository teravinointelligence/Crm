"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createClient } from "@/lib/supabase/client";
import { REGIONS, type Product, type Region } from "@/types/database";
import {
  FULFILLMENT_TYPES,
  FULFILLMENT_LABEL,
  FULFILLMENT_HINT,
  type FulfillmentType,
} from "@/lib/restock-fulfillment";
import { type Warehouse, type WarehouseStock } from "@/lib/warehouses";

type Line = { key: string; product_id: string | null; product_name: string; supplier: string | null; qty: number; notes: string };

const REGION_TO_WAREHOUSE: Record<string, Warehouse> = {
  "Los Cabos": "Los Cabos",
  "La Paz": "La Paz",
  "Todos Santos": "La Paz",
  "Tijuana": "Tijuana",
  "Puerto Vallarta": "Vallarta",
  "Nayarit": "Vallarta",
};

export function RestockRequestForm({
  products,
  repId,
  defaultRegion,
  warehouseStock = [],
}: {
  products: Product[];
  repId: string;
  defaultRegion?: string | null;
  warehouseStock?: WarehouseStock[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const [pending, startTransition] = useTransition();
  const [region, setRegion] = useState<string>(defaultRegion ?? "");
  const [fulfillment, setFulfillment] = useState<FulfillmentType>("almacen");

  // Almacén destino: para "almacen" es Los Cabos (origen que surtirá); para directo es la región.
  const destWarehouse: Warehouse | null = useMemo(() => {
    if (fulfillment === "almacen") return "Los Cabos";
    return region ? (REGION_TO_WAREHOUSE[region] ?? null) : null;
  }, [fulfillment, region]);

  const stockAt = useMemo(() => {
    if (!destWarehouse) return new Map<string, number>();
    return new Map(
      warehouseStock
        .filter((s) => s.warehouse === destWarehouse)
        .map((s) => [s.product_id, s.stock_quantity])
    );
  }, [warehouseStock, destWarehouse]);
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products.slice(0, 8);
    return products
      .filter((p) => p.active !== false && (p.name.toLowerCase().includes(q) || (p.sku ?? "").toLowerCase().includes(q) || p.supplier.toLowerCase().includes(q)))
      .slice(0, 12);
  }, [products, query]);

  const add = (p: Product) => {
    setLines((prev) => [...prev, { key: crypto.randomUUID(), product_id: p.id, product_name: p.name, supplier: p.supplier, qty: 1, notes: "" }]);
    setQuery("");
  };
  const addBlank = () => setLines((prev) => [...prev, { key: crypto.randomUUID(), product_id: null, product_name: "", supplier: null, qty: 1, notes: "" }]);
  const upd = (k: string, patch: Partial<Line>) => setLines((prev) => prev.map((l) => (l.key === k ? { ...l, ...patch } : l)));
  const rm = (k: string) => setLines((prev) => prev.filter((l) => l.key !== k));

  const submit = (status: "borrador" | "enviada") => {
    if (!lines.length) { toast.error("Agrega al menos un producto"); return; }
    if (lines.some((l) => !l.product_name.trim() || l.qty <= 0)) { toast.error("Revisa nombre y cantidad de las líneas"); return; }
    startTransition(async () => {
      const { data: num, error: numErr } = await supabase.rpc("next_request_number");
      if (numErr || !num) { toast.error("No pudimos generar el número", { description: numErr?.message }); return; }
      const { data: req, error: reqErr } = await supabase
        .from("restock_requests")
        .insert({ request_number: num, sales_rep_id: repId, region_destino: region || null, fulfillment, status, notes: notes || null })
        .select("id")
        .single();
      if (reqErr || !req) { toast.error("No pudimos crear el pedido", { description: reqErr?.message }); return; }
      const { error: itemsErr } = await supabase.from("restock_request_items").insert(
        lines.map((l) => ({ request_id: req.id, product_id: l.product_id, product_name: l.product_name, supplier: l.supplier, quantity_requested: l.qty, notes: l.notes || null })),
      );
      if (itemsErr) { toast.error("Líneas no se guardaron", { description: itemsErr.message }); return; }
      toast.success(`${num} ${status === "enviada" ? "enviado a revisión" : "guardado"}`);
      router.push(`/restock/${req.id}`);
      router.refresh();
    });
  };

  return (
    <div className="space-y-6">
      <Card><CardContent className="grid gap-4 p-6 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Región / plaza destino</Label>
          <Select value={region} onValueChange={setRegion}>
            <SelectTrigger><SelectValue placeholder="Selecciona" /></SelectTrigger>
            <SelectContent>{REGIONS.map((r: Region) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Tipo de surtido</Label>
          <Select value={fulfillment} onValueChange={(v) => setFulfillment(v as FulfillmentType)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {FULFILLMENT_TYPES.map((f) => (
                <SelectItem key={f} value={f}>{FULFILLMENT_LABEL[f]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">{FULFILLMENT_HINT[fulfillment]}</p>
        </div>
      </CardContent></Card>

      <Card><CardContent className="space-y-4 p-6">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-lg">Productos a pedir</h3>
          <Button type="button" variant="outline" size="sm" onClick={addBlank}><Plus className="mr-1 h-4 w-4" /> Manual</Button>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar producto del catálogo…" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-9" />
        </div>
        {filtered.length > 0 && (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((p) => {
              const destStock = stockAt.get(p.id);
              return (
                <button key={p.id} type="button" onClick={() => add(p)} className="rounded-md border bg-card p-3 text-left text-sm hover:border-brand-carmesi">
                  <div className="font-medium">{p.name}</div>
                  <div className="text-xs text-muted-foreground">{[p.supplier, p.vintage].filter(Boolean).join(" · ")}</div>
                  {destWarehouse && (
                    <div className={`mt-1 text-xs font-medium ${(destStock ?? 0) > 0 ? "text-amber-600" : "text-emerald-600"}`}>
                      {destWarehouse}: {destStock ?? 0} uds.
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}
        {lines.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin productos aún.</p>
        ) : (
          <table className="min-w-full text-sm">
            <thead className="border-b text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="py-2 pr-2">Producto</th>
                <th className="py-2 pr-2 w-20">Cant.</th>
                {destWarehouse && <th className="py-2 pr-2 w-28">Exist. {destWarehouse}</th>}
                <th className="py-2 pr-2">Nota</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => {
                const destStock = l.product_id ? (stockAt.get(l.product_id) ?? 0) : null;
                const overstock = destStock !== null && destStock > 0 && l.qty > 0;
                return (
                  <tr key={l.key} className="border-b align-top">
                    <td className="py-2 pr-2">
                      <Input value={l.product_name} onChange={(e) => upd(l.key, { product_name: e.target.value })} placeholder="Producto" />
                      {l.supplier && <div className="mt-1 text-xs text-muted-foreground">{l.supplier}</div>}
                    </td>
                    <td className="py-2 pr-2"><Input type="number" min={1} value={l.qty} onChange={(e) => upd(l.key, { qty: Number(e.target.value) || 0 })} /></td>
                    {destWarehouse && (
                      <td className="py-2 pr-2">
                        {destStock !== null ? (
                          <div className={`text-sm font-medium ${overstock ? "text-amber-600" : "text-muted-foreground"}`}>
                            {destStock} uds.
                            {overstock && <div className="text-xs font-normal">Hay stock</div>}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                    )}
                    <td className="py-2 pr-2"><Input value={l.notes} onChange={(e) => upd(l.key, { notes: e.target.value })} placeholder="urgencia, cliente…" /></td>
                    <td className="py-2"><Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-red-600" onClick={() => rm(l.key)}><Trash2 className="h-3.5 w-3.5" /></Button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </CardContent></Card>

      <Card><CardContent className="space-y-2 p-6">
        <Label htmlFor="notes">Notas</Label>
        <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Evento próximo, cliente que lo pidió, etc." />
      </CardContent></Card>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => router.back()} disabled={pending}>Cancelar</Button>
        <Button variant="ghost" onClick={() => submit("borrador")} disabled={pending}>Guardar borrador</Button>
        <Button onClick={() => submit("enviada")} disabled={pending}>{pending ? "Enviando…" : "Enviar a revisión"}</Button>
      </div>
    </div>
  );
}
