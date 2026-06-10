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
import { peoplePerBottles, OUNCES_PER_PERSON } from "@/lib/samples";
import type { Account, Product } from "@/types/database";

type Line = { key: string; product_id: string | null; product_name: string; supplier: string | null; qty: number; notes: string };
const NONE = "__none";

export function SampleRequestForm({
  accounts,
  products,
  repId,
  defaultAccountId,
}: {
  accounts: Pick<Account, "id" | "business_name" | "region">[];
  products: Pick<Product, "id" | "name" | "supplier" | "varietal" | "vintage" | "active" | "country" | "region_origin">[];
  repId: string;
  defaultAccountId?: string;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [pending, startTransition] = useTransition();
  const [accountId, setAccountId] = useState<string>(defaultAccountId ?? NONE);
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [query, setQuery] = useState("");

  const active = useMemo(() => products.filter((p) => p.active !== false), [products]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return active.slice(0, 12);
    const tokens = q.split(/\s+/);
    return active
      .filter((p) => {
        const hay = [p.name, p.supplier, p.varietal ?? "", p.country ?? "", p.region_origin ?? "", p.vintage ?? ""].join(" ").toLowerCase();
        return tokens.every((t) => hay.includes(t));
      })
      .slice(0, 40);
  }, [active, query]);

  const add = (p: { id: string; name: string; supplier: string }) => {
    setLines((prev) => [...prev, { key: crypto.randomUUID(), product_id: p.id, product_name: p.name, supplier: p.supplier, qty: 1, notes: "" }]);
    setQuery("");
  };
  const addBlank = () => setLines((prev) => [...prev, { key: crypto.randomUUID(), product_id: null, product_name: "", supplier: null, qty: 1, notes: "" }]);
  const upd = (k: string, patch: Partial<Line>) => setLines((prev) => prev.map((l) => (l.key === k ? { ...l, ...patch } : l)));
  const rm = (k: string) => setLines((prev) => prev.filter((l) => l.key !== k));

  const totalBottles = useMemo(() => lines.reduce((s, l) => s + (l.qty || 0), 0), [lines]);
  const totalPeople = useMemo(() => peoplePerBottles(totalBottles), [totalBottles]);

  const submit = (status: "borrador" | "enviada") => {
    if (!lines.length) { toast.error("Agrega al menos un vino"); return; }
    if (lines.some((l) => !l.product_name.trim() || l.qty <= 0)) { toast.error("Revisa nombre y cantidad de cada vino"); return; }
    startTransition(async () => {
      const { data: num, error: numErr } = await supabase.rpc("next_sample_number");
      if (numErr || !num) { toast.error("No pudimos generar el folio", { description: numErr?.message }); return; }
      const { data: req, error: reqErr } = await supabase
        .from("sample_requests")
        .insert({
          request_number: num,
          sales_rep_id: repId,
          account_id: accountId === NONE ? null : accountId,
          reason: reason || null,
          notes: notes || null,
          status,
        })
        .select("id")
        .single();
      if (reqErr || !req) { toast.error("No pudimos crear la solicitud", { description: reqErr?.message }); return; }
      const { error: itemsErr } = await supabase.from("sample_request_items").insert(
        lines.map((l) => ({ request_id: req.id, product_id: l.product_id, product_name: l.product_name, supplier: l.supplier, quantity: l.qty, notes: l.notes || null })),
      );
      if (itemsErr) { toast.error("Los vinos no se guardaron", { description: itemsErr.message }); return; }
      toast.success(`${num} ${status === "enviada" ? "enviada" : "guardada"}`);
      router.push(`/muestras/${req.id}`);
      router.refresh();
    });
  };

  return (
    <div className="space-y-6">
      <Card><CardContent className="grid gap-4 p-6 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Cliente / cuenta (opcional)</Label>
          <Select value={accountId} onValueChange={setAccountId}>
            <SelectTrigger><SelectValue placeholder="Para qué cliente" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>— Sin cliente específico —</SelectItem>
              {accounts.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.business_name}{a.region ? ` · ${a.region}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="reason">Motivo</Label>
          <Input id="reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Cata con el chef, cliente potencial, evento…" />
        </div>
      </CardContent></Card>

      <Card><CardContent className="space-y-4 p-6">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-lg">Vinos a probar</h3>
          <Button type="button" variant="outline" size="sm" onClick={addBlank}><Plus className="mr-1 h-4 w-4" /> Manual</Button>
        </div>
        <div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input placeholder="Buscar vino del catálogo…" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-9" /></div>
        {filtered.length > 0 && (
          <div className="grid max-h-72 gap-2 overflow-y-auto rounded-md border bg-muted/20 p-2 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((p) => (
              <button key={p.id} type="button" onClick={() => add(p)} className="rounded-md border bg-card p-2 text-left text-sm hover:border-brand-carmesi">
                <div className="font-medium">{p.name}</div>
                <div className="text-xs text-muted-foreground">{[p.supplier, p.varietal, p.vintage].filter(Boolean).join(" · ")}</div>
              </button>
            ))}
          </div>
        )}
        {lines.length === 0 ? <p className="text-sm text-muted-foreground">Aún no agregaste vinos.</p> : (
          <table className="min-w-full text-sm">
            <thead className="border-b text-left text-xs uppercase text-muted-foreground"><tr><th className="py-2 pr-2">Vino</th><th className="py-2 pr-2 w-20">Botellas</th><th className="py-2 pr-2 w-24 text-right">Rinde</th><th className="py-2 pr-2">Nota</th><th className="w-8" /></tr></thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.key} className="border-b align-top">
                  <td className="py-2 pr-2"><Input value={l.product_name} onChange={(e) => upd(l.key, { product_name: e.target.value })} placeholder="Vino" />{l.supplier && <div className="mt-1 text-xs text-muted-foreground">{l.supplier}</div>}</td>
                  <td className="py-2 pr-2"><Input type="number" min={1} value={l.qty} onChange={(e) => upd(l.key, { qty: Number(e.target.value) || 0 })} /></td>
                  <td className="py-2 pr-2 text-right tabular-nums text-muted-foreground whitespace-nowrap">≈ {peoplePerBottles(l.qty)} pers.</td>
                  <td className="py-2 pr-2"><Input value={l.notes} onChange={(e) => upd(l.key, { notes: e.target.value })} placeholder="añada específica, urgencia…" /></td>
                  <td className="py-2"><Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-red-600" onClick={() => rm(l.key)}><Trash2 className="h-3.5 w-3.5" /></Button></td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t">
              <tr>
                <td className="py-2 pr-2 text-right text-xs uppercase text-muted-foreground" colSpan={1}>Total</td>
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
        <Button variant="ghost" onClick={() => submit("borrador")} disabled={pending}>Guardar borrador</Button>
        <Button onClick={() => submit("enviada")} disabled={pending}>{pending ? "Enviando…" : "Enviar solicitud"}</Button>
      </div>
    </div>
  );
}
