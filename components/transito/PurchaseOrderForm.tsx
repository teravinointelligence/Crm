"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/utils";
import { IVA_RATE } from "@/lib/pricing";
import type { Product } from "@/types/database";

type Line = { key: string; product_id: string | null; product_name: string; qty: number; unit_cost: number; destination_region: string };

const KNOWN_SUPPLIERS = ["Vernazza","Bruma","Vinaltura","Brewwines","Lechuza","Wendlandt","Discográfica Vinícola","Finca La Carrodilla","Philipponnat","Habla","La Crema"];

export function PurchaseOrderForm({ products, sourceRequestIds }: { products: Product[]; sourceRequestIds?: string[] }) {
  const router = useRouter();
  const supabase = createClient();
  const [pending, startTransition] = useTransition();
  const [supplier, setSupplier] = useState("");
  const [eta, setEta] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let base = products;
    if (supplier.trim()) base = base.filter((p) => p.supplier.toLowerCase().includes(supplier.toLowerCase()));
    if (!q) return base.slice(0, 8);
    return base.filter((p) => p.name.toLowerCase().includes(q) || (p.sku ?? "").toLowerCase().includes(q)).slice(0, 12);
  }, [products, query, supplier]);

  const subtotal = lines.reduce((s, l) => s + l.qty * l.unit_cost, 0);
  const iva = Math.round(subtotal * IVA_RATE * 100) / 100;
  const total = Math.round((subtotal + iva) * 100) / 100;

  const add = (p: Product) => { setLines((prev) => [...prev, { key: crypto.randomUUID(), product_id: p.id, product_name: p.name, qty: 1, unit_cost: 0, destination_region: "" }]); setQuery(""); };
  const addBlank = () => setLines((prev) => [...prev, { key: crypto.randomUUID(), product_id: null, product_name: "", qty: 1, unit_cost: 0, destination_region: "" }]);
  const upd = (k: string, patch: Partial<Line>) => setLines((prev) => prev.map((l) => (l.key === k ? { ...l, ...patch } : l)));
  const rm = (k: string) => setLines((prev) => prev.filter((l) => l.key !== k));

  const submit = () => {
    if (!supplier.trim()) { toast.error("Indica el proveedor"); return; }
    if (!lines.length) { toast.error("Agrega al menos una línea"); return; }
    if (lines.some((l) => !l.product_name.trim() || l.qty <= 0)) { toast.error("Revisa nombre y cantidad"); return; }
    startTransition(async () => {
      const { data: num, error: numErr } = await supabase.rpc("next_po_number");
      if (numErr || !num) { toast.error("No pudimos generar el número", { description: numErr?.message }); return; }
      const { data: po, error: poErr } = await supabase
        .from("purchase_orders")
        .insert({ po_number: num, supplier: supplier.trim(), expected_arrival_date: eta || null, subtotal, iva, total, status: "borrador", source_request_ids: sourceRequestIds && sourceRequestIds.length ? sourceRequestIds : null })
        .select("id")
        .single();
      if (poErr || !po) { toast.error("No pudimos crear la OC", { description: poErr?.message }); return; }
      const { error: itemsErr } = await supabase.from("purchase_order_items").insert(
        lines.map((l) => ({ po_id: po.id, product_id: l.product_id, product_name: l.product_name, quantity_ordered: l.qty, unit_cost: l.unit_cost, line_total: Math.round(l.qty * l.unit_cost * 100) / 100, destination_region: l.destination_region || null })),
      );
      if (itemsErr) { toast.error("Líneas no se guardaron", { description: itemsErr.message }); return; }
      if (sourceRequestIds?.length) {
        await supabase.from("restock_requests").update({ status: "convertida_oc" }).in("id", sourceRequestIds);
      }
      toast.success(`${num} creada`);
      router.push(`/transito/${po.id}`);
      router.refresh();
    });
  };

  return (
    <div className="space-y-6">
      <Card><CardContent className="grid gap-4 p-6 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="supplier">Proveedor *</Label>
          <Input id="supplier" value={supplier} onChange={(e) => setSupplier(e.target.value)} list="po-suppliers" placeholder="Vernazza, Bruma…" />
          <datalist id="po-suppliers">{KNOWN_SUPPLIERS.map((s) => <option key={s} value={s} />)}</datalist>
        </div>
        <div className="space-y-2">
          <Label htmlFor="eta">ETA estimada</Label>
          <Input id="eta" type="date" value={eta} onChange={(e) => setEta(e.target.value)} />
        </div>
      </CardContent></Card>

      <Card><CardContent className="space-y-4 p-6">
        <div className="flex items-center justify-between"><h3 className="font-display text-lg">Líneas</h3><Button type="button" variant="outline" size="sm" onClick={addBlank}><Plus className="mr-1 h-4 w-4" /> Manual</Button></div>
        <div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input placeholder="Buscar producto…" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-9" /></div>
        {filtered.length > 0 && (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((p) => (
              <button key={p.id} type="button" onClick={() => add(p)} className="rounded-md border bg-card p-3 text-left text-sm hover:border-brand-carmesi">
                <div className="font-medium">{p.name}</div><div className="text-xs text-muted-foreground">{p.supplier} · stock {p.stock_quantity ?? 0}</div>
              </button>
            ))}
          </div>
        )}
        {lines.length === 0 ? <p className="text-sm text-muted-foreground">Sin líneas aún.</p> : (
          <table className="min-w-full text-sm">
            <thead className="border-b text-left text-xs uppercase text-muted-foreground"><tr><th className="py-2 pr-2">Producto</th><th className="py-2 pr-2 w-20">Cant.</th><th className="py-2 pr-2 w-28">Costo unit.</th><th className="py-2 pr-2 w-28">Destino</th><th className="py-2 pr-2 text-right w-24">Total</th><th className="w-8" /></tr></thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.key} className="border-b align-top">
                  <td className="py-2 pr-2"><Input value={l.product_name} onChange={(e) => upd(l.key, { product_name: e.target.value })} placeholder="Producto" /></td>
                  <td className="py-2 pr-2"><Input type="number" min={1} value={l.qty} onChange={(e) => upd(l.key, { qty: Number(e.target.value) || 0 })} /></td>
                  <td className="py-2 pr-2"><Input type="number" min={0} step="0.01" value={l.unit_cost} onChange={(e) => upd(l.key, { unit_cost: Number(e.target.value) || 0 })} /></td>
                  <td className="py-2 pr-2"><Input value={l.destination_region} onChange={(e) => upd(l.key, { destination_region: e.target.value })} placeholder="región" /></td>
                  <td className="py-2 pr-2 text-right font-medium">{formatCurrency(l.qty * l.unit_cost)}</td>
                  <td className="py-2"><Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-red-600" onClick={() => rm(l.key)}><Trash2 className="h-3.5 w-3.5" /></Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="space-y-1 border-t pt-4 text-sm">
          <div className="flex justify-between text-muted-foreground"><span>Subtotal</span><span>{formatCurrency(subtotal)}</span></div>
          <div className="flex justify-between text-muted-foreground"><span>IVA 16%</span><span>{formatCurrency(iva)}</span></div>
          <div className="flex justify-between font-display text-xl"><span>Total</span><span className="text-brand-carmesi">{formatCurrency(total)}</span></div>
        </div>
      </CardContent></Card>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => router.back()} disabled={pending}>Cancelar</Button>
        <Button onClick={submit} disabled={pending}>{pending ? "Creando…" : "Crear OC"}</Button>
      </div>
    </div>
  );
}
