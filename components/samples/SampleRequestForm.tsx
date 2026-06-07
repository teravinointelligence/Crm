"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Plus, Trash2, Search, CalendarPlus, Check, Users, Lock, GraduationCap, Package, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";
import { cn, formatDateTime } from "@/lib/utils";
import type { Product } from "@/types/database";

type Line = { key: string; product_id: string | null; product_name: string; supplier: string | null; qty: number; notes: string };
type Cita = {
  id: string;
  activity_date: string;
  activity_type: string;
  account_id: string | null;
  account_name: string | null;
  client_number: string | null;
};

// Mínimo de citas (clientes) para PEDIR una muestra. Para volver a pedir el mismo
// vino hacen falta 3 clientes distintos, pero eso se acumula después en la muestra.
const MIN_PEDIR = 1;

// Capacitaciones: 1 botella de 750 ml alcanza para 8 tastings (personas).
const TASTINGS_POR_BOTELLA = 8;
const botellasParaPersonas = (personas: number) => Math.max(1, Math.ceil(personas / TASTINGS_POR_BOTELLA));

export function SampleRequestForm({
  products,
  repId,
  isAdmin,
  citas,
  lockedProductIds,
  bankProductIds,
  preselectAccountId,
}: {
  products: Pick<Product, "id" | "name" | "supplier" | "varietal" | "vintage" | "active" | "country" | "region_origin">[];
  repId: string;
  isAdmin: boolean;
  citas: Cita[];
  lockedProductIds: string[];
  bankProductIds: string[];
  preselectAccountId?: string;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [pending, startTransition] = useTransition();
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [isTraining, setIsTraining] = useState(false);
  const [trainingPeople, setTrainingPeople] = useState<number>(8);
  const [shipToClient, setShipToClient] = useState(false);
  const [shipDate, setShipDate] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>(() =>
    preselectAccountId ? citas.filter((c) => c.account_id === preselectAccountId).map((c) => c.id) : [],
  );

  // Los vinos "en uso" solo bloquean a los vendedores; el Admin queda exento.
  const lockedSet = useMemo(() => new Set(isAdmin ? [] : lockedProductIds), [isAdmin, lockedProductIds]);
  // Vinos que ya están en el banco de la zona del vendedor: hay que tomarlos de ahí.
  const bankSet = useMemo(() => new Set(isAdmin ? [] : bankProductIds), [isAdmin, bankProductIds]);

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

  const citaById = useMemo(() => new Map(citas.map((c) => [c.id, c])), [citas]);
  const selectedCitas = useMemo(
    () => selected.map((id) => citaById.get(id)).filter((c): c is Cita => Boolean(c)),
    [selected, citaById],
  );
  const distinctClients = useMemo(
    () => new Set(selectedCitas.map((c) => c.account_id).filter(Boolean)).size,
    [selectedCitas],
  );
  const canPedir = distinctClients >= MIN_PEDIR;
  const primaryAccountId = selectedCitas[0]?.account_id ?? null;

  const toggleCita = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  // En capacitación, las botellas por vino se calculan por personas (8 por botella).
  const botellasPorVino = isTraining && trainingPeople > 0 ? botellasParaPersonas(trainingPeople) : null;
  const defaultQty = () => botellasPorVino ?? 1;
  // Autocompleta las botellas de todos los vinos según las personas (editable después).
  const aplicarBotellas = (personas: number) =>
    setLines((prev) => prev.map((l) => ({ ...l, qty: botellasParaPersonas(personas) })));
  const toggleTraining = (on: boolean) => {
    setIsTraining(on);
    if (on && trainingPeople > 0) aplicarBotellas(trainingPeople);
  };
  const setPeople = (n: number) => {
    setTrainingPeople(n);
    if (isTraining && n > 0) aplicarBotellas(n);
  };

  const add = (p: { id: string; name: string; supplier: string }) => {
    if (bankSet.has(p.id)) {
      toast.error("Este vino está en el banco de tu zona", { description: "Tómala del banco de muestras antes de pedir otra." });
      return;
    }
    if (lockedSet.has(p.id)) {
      toast.error("Ya tienes esta muestra en uso", { description: "Complétala con 3 clientes (agrégale citas en la muestra) antes de volver a pedirla." });
      return;
    }
    setLines((prev) => [...prev, { key: crypto.randomUUID(), product_id: p.id, product_name: p.name, supplier: p.supplier, qty: defaultQty(), notes: "" }]);
    setQuery("");
  };
  const addBlank = () => setLines((prev) => [...prev, { key: crypto.randomUUID(), product_id: null, product_name: "", supplier: null, qty: defaultQty(), notes: "" }]);
  const upd = (k: string, patch: Partial<Line>) => setLines((prev) => prev.map((l) => (l.key === k ? { ...l, ...patch } : l)));
  const rm = (k: string) => setLines((prev) => prev.filter((l) => l.key !== k));

  const submit = (status: "borrador" | "enviada") => {
    if (!lines.length) { toast.error("Agrega al menos un vino"); return; }
    if (lines.some((l) => !l.product_name.trim() || l.qty <= 0)) { toast.error("Revisa nombre y cantidad de cada vino"); return; }
    const bankInLines = lines.filter((l) => l.product_id && bankSet.has(l.product_id));
    if (bankInLines.length) {
      toast.error("Esos vinos están en el banco de tu zona", { description: `${bankInLines.map((l) => l.product_name).join(", ")} — tómalas del banco de muestras en vez de pedir otra.` });
      return;
    }
    const lockedInLines = lines.filter((l) => l.product_id && lockedSet.has(l.product_id));
    if (lockedInLines.length) {
      toast.error("Tienes vinos que aún están en uso", { description: `${lockedInLines.map((l) => l.product_name).join(", ")} — complétalas con 3 clientes antes de volver a pedirlas.` });
      return;
    }
    if (status === "enviada" && !isAdmin && !canPedir) {
      toast.error(`Necesitas al menos ${MIN_PEDIR} cita agendada con un cliente para enviar`);
      return;
    }
    if (isTraining && (!trainingPeople || trainingPeople < 1)) {
      toast.error("Indica para cuántas personas es la capacitación");
      return;
    }
    if (shipToClient) {
      if (!primaryAccountId) {
        toast.error("Para enviar al cliente, selecciona una cita de un cliente ya registrado");
        return;
      }
      if (!shipDate) {
        toast.error("Indica qué día se necesitan enviar las muestras");
        return;
      }
    }
    startTransition(async () => {
      // El folio (request_number) lo asigna la BD en el INSERT, de forma atómica,
      // para evitar folios duplicados por envíos concurrentes.
      // Siempre se crea como borrador; el paso a "enviada" va al final, ya con las
      // citas guardadas, para que el candado de la BD valide con la info completa.
      const { data: req, error: reqErr } = await supabase
        .from("sample_requests")
        .insert({
          sales_rep_id: repId,
          account_id: primaryAccountId,
          reason: reason || null,
          notes: notes || null,
          training_people: isTraining ? trainingPeople : null,
          ship_to_client: shipToClient,
          ship_date: shipToClient ? shipDate : null,
          status: "borrador",
        })
        .select("id, request_number")
        .single();
      if (reqErr || !req) { toast.error("No pudimos crear la solicitud", { description: reqErr?.message }); return; }
      const { error: itemsErr } = await supabase.from("sample_request_items").insert(
        lines.map((l) => ({ request_id: req.id, product_id: l.product_id, product_name: l.product_name, supplier: l.supplier, quantity: l.qty, notes: l.notes || null })),
      );
      if (itemsErr) { toast.error("No se pudieron guardar los vinos", { description: itemsErr.message }); return; }
      if (selected.length) {
        const { error: citErr } = await supabase
          .from("sample_request_activities")
          .insert(selected.map((activity_id) => ({ request_id: req.id, activity_id })));
        if (citErr) { toast.error("Las citas no se guardaron", { description: citErr.message }); return; }
      }
      if (status === "enviada") {
        const { error: sendErr } = await supabase.from("sample_requests").update({ status: "enviada" }).eq("id", req.id);
        if (sendErr) {
          // No dejar un borrador a medias: limpiamos la solicitud recién creada.
          await supabase.from("sample_requests").delete().eq("id", req.id);
          toast.error("No se pudo enviar la solicitud", { description: sendErr.message });
          return;
        }
      }
      toast.success(`${req.request_number} ${status === "enviada" ? "enviada" : "guardada"}`);
      router.push(`/muestras/${req.id}`);
      router.refresh();
    });
  };

  const sendDisabled = pending || (!isAdmin && !canPedir);

  return (
    <div className="space-y-6">
      <Card><CardContent className="space-y-3 p-6">
        <div className="space-y-2">
          <Label htmlFor="reason">Motivo</Label>
          <Input id="reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Cata con el chef, cliente potencial, evento…" />
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={isTraining}
            onChange={(e) => toggleTraining(e.target.checked)}
            className="h-4 w-4 rounded border-input"
          />
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
              onChange={(e) => setPeople(Number(e.target.value) || 0)}
              className="w-32"
            />
            {trainingPeople > 0 && (
              <p className="text-xs text-muted-foreground">
                1 botella (750 ml) alcanza para {TASTINGS_POR_BOTELLA} personas → se piden{" "}
                <strong className="text-foreground">{botellasParaPersonas(trainingPeople)} botella(s) por vino</strong>.
                Puedes ajustarlas abajo.
              </p>
            )}
          </div>
        )}

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={shipToClient}
            onChange={(e) => setShipToClient(e.target.checked)}
            className="h-4 w-4 rounded border-input"
          />
          El cliente pide que se le envíen las muestras
        </label>

        {shipToClient && (
          <div className="space-y-2 rounded-md border bg-muted/20 p-3">
            <Label htmlFor="shipDate" className="flex items-center gap-1.5">
              <Truck className="h-4 w-4" /> ¿Qué día se necesitan enviar?
            </Label>
            <Input
              id="shipDate"
              type="date"
              value={shipDate}
              onChange={(e) => setShipDate(e.target.value)}
              className="w-44"
            />
            <p className="text-xs text-muted-foreground">
              Se envían al cliente (no entran al banco de muestras). El cliente debe estar registrado:
              selecciona abajo una cita de un cliente ya dado de alta.
            </p>
          </div>
        )}
      </CardContent></Card>

      <Card><CardContent className="space-y-4 p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-display text-lg">Citas con clientes</h3>
            <p className="text-sm text-muted-foreground">Necesitas al menos {MIN_PEDIR} cita agendada para pedir la muestra. Luego suma más citas desde la muestra (hasta 3 clientes) para volver a pedir el mismo vino.</p>
          </div>
          <span className={cn(
            "inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-medium",
            canPedir ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800",
          )}>
            <Users className="h-4 w-4" /> {distinctClients} cliente{distinctClients === 1 ? "" : "s"}
          </span>
        </div>

        {citas.length === 0 ? (
          <div className="rounded-md border border-dashed bg-muted/20 p-6 text-center text-sm text-muted-foreground">
            <CalendarPlus className="mx-auto mb-2 h-6 w-6" />
            No tienes citas agendadas a futuro. Primero agenda una visita y luego solicita la muestra.
            <div className="mt-3">
              <Button asChild variant="outline" size="sm"><Link href="/actividades/nueva">Agendar una cita</Link></Button>
            </div>
          </div>
        ) : (
          <div className="grid max-h-72 gap-2 overflow-y-auto rounded-md border bg-muted/20 p-2 sm:grid-cols-2">
            {citas.map((c) => {
              const on = selected.includes(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => toggleCita(c.id)}
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
                    <span className="block truncate font-medium">
                      {c.account_name ?? "Sin cliente"}{c.client_number ? ` · #${c.client_number}` : ""}
                    </span>
                    <span className="block text-xs text-muted-foreground">{formatDateTime(c.activity_date)} · {c.activity_type}</span>
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {!canPedir && citas.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {isAdmin
              ? "Como Admin puedes enviar aunque no selecciones citas."
              : `Selecciona al menos ${MIN_PEDIR} cita para poder enviar.`}
          </p>
        )}
      </CardContent></Card>

      <Card><CardContent className="space-y-4 p-6">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-lg">Vinos a probar</h3>
          <Button type="button" variant="outline" size="sm" onClick={addBlank}><Plus className="mr-1 h-4 w-4" /> Manual</Button>
        </div>
        <div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input placeholder="Buscar vino del catálogo…" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-9" /></div>
        {filtered.length > 0 && (
          <div className="grid max-h-72 gap-2 overflow-y-auto rounded-md border bg-muted/20 p-2 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((p) => {
              const inBank = bankSet.has(p.id);
              const locked = lockedSet.has(p.id);
              return inBank ? (
                <div key={p.id} className="rounded-md border border-brand-carmesi/30 bg-brand-carmesi/5 p-2 text-left text-sm" title="Este vino ya está en el banco de muestras de tu zona; tómala de ahí.">
                  <div className="flex items-center gap-1 font-medium"><Package className="h-3 w-3" /> {p.name}</div>
                  <div className="text-xs text-brand-carmesi">
                    En el banco de tu zona — <Link href="/muestras/banco" className="underline">tómala de ahí</Link>
                  </div>
                </div>
              ) : locked ? (
                <div key={p.id} className="rounded-md border bg-muted/40 p-2 text-left text-sm opacity-70" title="Ya tienes esta muestra en uso; complétala con 3 clientes para liberarla.">
                  <div className="flex items-center gap-1 font-medium"><Lock className="h-3 w-3" /> {p.name}</div>
                  <div className="text-xs text-amber-700">En uso — agrégale citas para liberarla</div>
                </div>
              ) : (
                <button key={p.id} type="button" onClick={() => add(p)} className="rounded-md border bg-card p-2 text-left text-sm hover:border-brand-carmesi">
                  <div className="font-medium">{p.name}</div>
                  <div className="text-xs text-muted-foreground">{[p.supplier, p.varietal, p.vintage].filter(Boolean).join(" · ")}</div>
                </button>
              );
            })}
          </div>
        )}
        {lines.length === 0 ? <p className="text-sm text-muted-foreground">Aún no agregaste vinos.</p> : (
          <table className="min-w-full text-sm">
            <thead className="border-b text-left text-xs uppercase text-muted-foreground"><tr><th className="py-2 pr-2">Vino</th><th className="py-2 pr-2 w-20">Botellas</th><th className="py-2 pr-2">Nota</th><th className="w-8" /></tr></thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.key} className="border-b align-top">
                  <td className="py-2 pr-2"><Input value={l.product_name} onChange={(e) => upd(l.key, { product_name: e.target.value })} placeholder="Vino" />{l.supplier && <div className="mt-1 text-xs text-muted-foreground">{l.supplier}</div>}</td>
                  <td className="py-2 pr-2"><Input type="number" min={1} value={l.qty} onChange={(e) => upd(l.key, { qty: Number(e.target.value) || 0 })} /></td>
                  <td className="py-2 pr-2"><Input value={l.notes} onChange={(e) => upd(l.key, { notes: e.target.value })} placeholder="añada específica, urgencia…" /></td>
                  <td className="py-2"><Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-red-600" onClick={() => rm(l.key)}><Trash2 className="h-3.5 w-3.5" /></Button></td>
                </tr>
              ))}
            </tbody>
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
        <Button onClick={() => submit("enviada")} disabled={sendDisabled}>{pending ? "Enviando…" : "Enviar solicitud"}</Button>
      </div>
    </div>
  );
}
