"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2, Truck, GraduationCap, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";
import { peoplePerBottles, peopleServed, DEFAULT_BOTTLE_ML, OUNCES_PER_PERSON } from "@/lib/samples";
import type { Product } from "@/types/database";

type Line = {
  key: string;
  product_id: string | null;
  product_name: string;
  supplier: string | null;
  qty: number;
  notes: string;
};

const TASTINGS_POR_BOTELLA = peopleServed(DEFAULT_BOTTLE_ML);

export function SampleEditForm({
  requestId,
  initialStatus,
  initialItems,
  initialReason,
  initialNotes,
  initialShipToClient,
  initialShipDate,
  initialTrainingPeople,
  products,
}: {
  requestId: string;
  initialStatus: string;
  initialItems: Array<{ product_id: string | null; product_name: string; supplier: string | null; quantity: number; notes: string | null }>;
  initialReason: string | null;
  initialNotes: string | null;
  initialShipToClient: boolean;
  initialShipDate: string | null;
  initialTrainingPeople: number | null;
  products: Pick<Product, "id" | "name" | "supplier" | "varietal" | "vintage">[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const [pending, startTransition] = useTransition();

  const [lines, setLines] = useState<Line[]>(
    initialItems.map((i, idx) => ({
      key: String(idx),
      product_id: i.product_id,
      product_name: i.product_name,
      supplier: i.supplier,
      qty: i.quantity,
      notes: i.notes ?? "",
    })),
  );
  const [reason, setReason] = useState(initialReason ?? "");
  const [notes, setNotes] = useState(initialNotes ?? "");
  const [shipToClient, setShipToClient] = useState(initialShipToClient);
  const [shipDate, setShipDate] = useState(initialShipDate ?? "");
  const [isTraining, setIsTraining] = useState(Boolean(initialTrainingPeople));
  const [trainingPeople, setTrainingPeople] = useState(initialTrainingPeople ?? 8);
  const [query, setQuery] = useState("");

  const filtered = query.trim()
    ? products.filter((p) =>
        [p.name, p.supplier, p.varietal].join(" ").toLowerCase().includes(query.toLowerCase()),
      ).slice(0, 24)
    : [];

  const addProduct = (p: Pick<Product, "id" | "name" | "supplier" | "varietal" | "vintage">) => {
    setLines((prev) => [
      ...prev,
      { key: Math.random().toString(36).slice(2), product_id: p.id, product_name: p.name, supplier: p.supplier ?? null, qty: 1, notes: "" },
    ]);
    setQuery("");
  };

  const addBlank = () =>
    setLines((prev) => [...prev, { key: Math.random().toString(36).slice(2), product_id: null, product_name: "", supplier: null, qty: 1, notes: "" }]);

  const upd = (key: string, patch: Partial<Line>) =>
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const rm = (key: string) => setLines((prev) => prev.filter((l) => l.key !== key));

  const totalBottles = lines.reduce((s, l) => s + (l.qty || 0), 0);
  const totalPeople = lines.reduce((s, l) => s + peoplePerBottles(l.qty), 0);

  const wasApproved = initialStatus === "aprobada";

  const save = () => {
    if (!lines.length) { toast.error("Agrega al menos un vino"); return; }
    startTransition(async () => {
      // 1. Update request fields; si estaba aprobada vuelve a enviada
      const { error: reqErr } = await supabase
        .from("sample_requests")
        .update({
          reason: reason || null,
          notes: notes || null,
          ship_to_client: shipToClient,
          ship_date: shipToClient && shipDate ? shipDate : null,
          training_people: isTraining && trainingPeople > 0 ? trainingPeople : null,
          ...(wasApproved ? { status: "enviada", reviewed_by: null, reviewed_at: null, review_notes: null } : {}),
        })
        .eq("id", requestId);

      if (reqErr) { toast.error("No se pudo guardar", { description: reqErr.message }); return; }

      // 2. Si estaba aprobada, revertir movimientos del banco
      if (wasApproved) {
        await supabase
          .from("sample_bank_movements")
          .delete()
          .eq("request_id", requestId)
          .eq("movement_type", "ingreso");
      }

      // 3. Replace items: delete + insert
      const { error: delErr } = await supabase
        .from("sample_request_items")
        .delete()
        .eq("request_id", requestId);

      if (delErr) { toast.error("Error al actualizar vinos", { description: delErr.message }); return; }

      const newItems = lines
        .filter((l) => l.product_name.trim())
        .map((l) => ({
          request_id: requestId,
          product_id: l.product_id,
          product_name: l.product_name.trim(),
          supplier: l.supplier,
          quantity: l.qty,
          notes: l.notes || null,
        }));

      const { error: insErr } = await supabase.from("sample_request_items").insert(newItems);
      if (insErr) { toast.error("Error al guardar vinos", { description: insErr.message }); return; }

      toast.success(wasApproved ? "Solicitud actualizada y enviada a revisión" : "Solicitud actualizada");
      router.push(`/muestras/${requestId}`);
      router.refresh();
    });
  };

  return (
    <div className="space-y-6">
      <Card><CardContent className="space-y-4 p-6">
        <h3 className="font-display text-lg">Detalles</h3>

        <div className="space-y-2">
          <Label htmlFor="reason">Motivo</Label>
          <Input
            id="reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Cata con el chef, cliente potencial, evento…"
          />
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={isTraining} onChange={(e) => setIsTraining(e.target.checked)} className="h-4 w-4 rounded border-input" />
          Es una capacitación
        </label>

        {isTraining && (
          <div className="space-y-2 rounded-md border bg-muted/20 p-3">
            <Label htmlFor="people" className="flex items-center gap-1.5">
              <GraduationCap className="h-4 w-4" /> ¿Para cuántas personas?
            </Label>
            <Input
              id="people"
              type="number"
              min={1}
              value={trainingPeople || ""}
              onChange={(e) => setTrainingPeople(Number(e.target.value) || 0)}
              className="w-32"
            />
            {trainingPeople > 0 && (
              <p className="text-xs text-muted-foreground">
                1 botella (750 ml) alcanza para {TASTINGS_POR_BOTELLA} personas ({OUNCES_PER_PERSON} oz c/u)
              </p>
            )}
          </div>
        )}

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={shipToClient} onChange={(e) => setShipToClient(e.target.checked)} className="h-4 w-4 rounded border-input" />
          El cliente pide que se le envíen las muestras
        </label>

        {shipToClient && (
          <div className="space-y-2 rounded-md border bg-muted/20 p-3">
            <Label htmlFor="shipDate" className="flex items-center gap-1.5">
              <Truck className="h-4 w-4" /> ¿Qué día se necesitan enviar?
            </Label>
            <Input id="shipDate" type="date" value={shipDate} onChange={(e) => setShipDate(e.target.value)} className="w-44" />
          </div>
        )}
      </CardContent></Card>

      <Card><CardContent className="space-y-4 p-6">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-lg">Vinos a probar</h3>
          <Button type="button" variant="outline" size="sm" onClick={addBlank}><Plus className="mr-1 h-4 w-4" /> Manual</Button>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar vino del catálogo…" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-9" />
        </div>

        {filtered.length > 0 && (
          <div className="grid max-h-60 gap-2 overflow-y-auto rounded-md border bg-muted/20 p-2 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((p) => (
              <button key={p.id} type="button" onClick={() => addProduct(p)} className="rounded-md border bg-card p-2 text-left text-sm hover:border-brand-carmesi">
                <div className="font-medium">{p.name}</div>
                <div className="text-xs text-muted-foreground">{[p.supplier, p.varietal, p.vintage].filter(Boolean).join(" · ")}</div>
              </button>
            ))}
          </div>
        )}

        {lines.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aún no hay vinos.</p>
        ) : (
          <table className="min-w-full text-sm">
            <thead className="border-b text-left text-xs uppercase text-muted-foreground">
              <tr><th className="py-2 pr-2">Vino</th><th className="py-2 pr-2 w-20">Botellas</th><th className="py-2 pr-2 w-24 text-right">Rinde</th><th className="py-2 pr-2">Nota</th><th className="w-8" /></tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.key} className="border-b align-top">
                  <td className="py-2 pr-2"><Input value={l.product_name} onChange={(e) => upd(l.key, { product_name: e.target.value })} placeholder="Vino" />{l.supplier && <div className="mt-1 text-xs text-muted-foreground">{l.supplier}</div>}</td>
                  <td className="py-2 pr-2"><Input type="number" min={1} value={l.qty} onChange={(e) => upd(l.key, { qty: Number(e.target.value) || 0 })} /></td>
                  <td className="py-2 pr-2 text-right tabular-nums text-muted-foreground whitespace-nowrap">≈ {peoplePerBottles(l.qty)} pers.</td>
                  <td className="py-2 pr-2"><Input value={l.notes} onChange={(e) => upd(l.key, { notes: e.target.value })} placeholder="añada específica…" /></td>
                  <td className="py-2"><Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-red-600" onClick={() => rm(l.key)}><Trash2 className="h-3.5 w-3.5" /></Button></td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t">
              <tr>
                <td className="py-2 pr-2 text-right text-xs uppercase text-muted-foreground">Total</td>
                <td className="py-2 pr-2 font-medium tabular-nums">{totalBottles}</td>
                <td className="py-2 pr-2 text-right font-medium tabular-nums whitespace-nowrap">≈ {totalPeople} pers.</td>
                <td className="py-2 pr-2 text-xs text-muted-foreground" colSpan={2}>{OUNCES_PER_PERSON} oz por persona · botella de 750 ml</td>
              </tr>
            </tfoot>
          </table>
        )}
      </CardContent></Card>

      <Card><CardContent className="space-y-2 p-6">
        <Label htmlFor="notes">Notas</Label>
        <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Contexto de la cata, fecha tentativa, etc." />
      </CardContent></Card>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => router.back()} disabled={pending}>Cancelar</Button>
        <Button onClick={save} disabled={pending}>{pending ? "Guardando…" : "Guardar cambios"}</Button>
      </div>
    </div>
  );
}
