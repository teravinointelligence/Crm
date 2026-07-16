import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Boxes, PackageOpen, Package, Wine, History } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRep } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SampleBankClient, type BankRow, type RegionMetrics, type HistoryEntry } from "@/components/samples/SampleBankClient";

export const metadata = { title: "Banco de muestras — TERAVINO CRM" };

export default async function BancoMuestrasPage() {
  const supabase = createClient();
  const rep = await getCurrentRep();
  if (!rep) redirect("/login");
  const isAdmin = rep.role === "admin";

  // RLS: el vendedor solo ve su zona; admin/contador ven todas.
  const [{ data: viewData }, { data: movData }, { data: encData }, { data: acctData }] = await Promise.all([
    supabase
      .from("v_sample_bank")
      .select("product_id, product_name, supplier, region, location, available, ingresado, tomado")
      .gt("available", 0)
      .order("region")
      .order("product_name"),
    supabase
      .from("sample_bank_movements")
      .select("id, reverts_id, product_id, region, quantity, kind, account_id, created_at, notes, rep:taken_by(full_name), account:account_id(business_name)")
      .in("kind", ["toma", "devolucion"])
      .order("created_at", { ascending: false }),
    supabase.from("account_products").select("account_id, product_id").eq("status", "encartado"),
    supabase.from("accounts").select("id, business_name, region").order("business_name"),
  ]);

  const rows: BankRow[] = (viewData ?? []).map((r) => ({
    product_id: r.product_id as string,
    product_name: (r.product_name as string) ?? "",
    supplier: (r.supplier as string | null) ?? null,
    region: (r.region as string | null) ?? null,
    location: (r.location as string | null) ?? null,
    available: Number(r.available ?? 0),
    ingresado: Number(r.ingresado ?? 0),
    tomado: Number(r.tomado ?? 0),
  }));

  // Métricas de uso vs encartes (las tomas tienen cantidad negativa).
  const encartado = new Set((encData ?? []).map((e) => `${e.account_id}|${e.product_id}`));
  const movAll = (movData ?? []) as unknown as {
    id: string; reverts_id: string | null; kind: string;
    product_id: string; region: string | null; quantity: number | string; account_id: string | null;
    created_at: string | null; notes: string | null;
    rep: { full_name: string | null } | null; account: { business_name: string | null } | null;
  }[];

  // Botellas ya devueltas por toma (las devoluciones apuntan a su toma via reverts_id).
  const revertedQty = new Map<string, number>();
  for (const d of movAll) {
    if (d.kind !== "devolucion" || !d.reverts_id) continue;
    revertedQty.set(d.reverts_id, (revertedQty.get(d.reverts_id) ?? 0) + Number(d.quantity ?? 0));
  }
  // Tomas con su cantidad NETA (descontando lo devuelto). Las totalmente
  // devueltas (neto 0) no cuentan como usadas ni como último uso.
  const tomas = movAll
    .filter((m) => m.kind === "toma")
    .map((t) => ({ ...t, net: Math.max(0, -Number(t.quantity ?? 0) - (revertedQty.get(t.id) ?? 0)) }));

  // Último uso por (producto|zona): quién la tomó, para qué cliente y cuándo.
  // `tomas` viene ordenado por created_at desc, así que la primera por clave es la más reciente.
  const lastUse: Record<string, { rep: string | null; account: string | null; date: string | null; note: string | null }> = {};
  for (const t of tomas) {
    if (t.net <= 0) continue;
    const key = `${t.product_id}|${t.region ?? "Sin zona"}`;
    if (lastUse[key]) continue;
    lastUse[key] = {
      rep: t.rep?.full_name ?? null,
      account: t.account?.business_name ?? null,
      date: t.created_at,
      note: t.notes,
    };
  }

  // Historial completo por (producto|zona): se muestra al hacer clic en el vino.
  // movAll ya viene ordenado por created_at desc.
  const historyByKey: Record<string, HistoryEntry[]> = {};
  for (const m of movAll) {
    const key = `${m.product_id}|${m.region ?? "Sin zona"}`;
    (historyByKey[key] ??= []).push({
      id: m.id,
      kind: m.kind === "toma" ? "toma" : "devolucion",
      qty: Math.abs(Number(m.quantity ?? 0)),
      date: m.created_at,
      rep: m.rep?.full_name ?? null,
      account: m.account?.business_name ?? null,
      note: m.notes,
    });
  }

  let usadas = 0;
  let encartadas = 0;
  const byRegion = new Map<string, RegionMetrics>();
  for (const t of tomas) {
    const used = t.net;
    if (used <= 0) continue;
    usadas += used;
    const isEnc = t.account_id && encartado.has(`${t.account_id}|${t.product_id}`);
    if (isEnc) encartadas += used;
    const region = t.region ?? "Sin zona";
    const rm = byRegion.get(region) ?? { usadas: 0, encartadas: 0 };
    rm.usadas += used;
    if (isEnc) rm.encartadas += used;
    byRegion.set(region, rm);
  }
  const disponibles = rows.reduce((s, r) => s + r.available, 0);
  const pctEncartes = usadas ? Math.round((encartadas / usadas) * 100) : 0;
  const metricsByRegion = Object.fromEntries(byRegion);

  const accounts = (acctData ?? []) as { id: string; business_name: string; region: string | null }[];

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link href="/muestras"><ArrowLeft className="mr-1 h-4 w-4" /> Muestras</Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href="/muestras/banco/historial"><History className="mr-1 h-4 w-4" /> Historial de tomas</Link>
        </Button>
      </div>
      <div>
        <h1 className="font-display text-3xl">Banco de muestras</h1>
        <p className="text-sm text-muted-foreground">
          {isAdmin
            ? "Botellas de muestra disponibles por zona y bodega. Entran al banco cuando autorizas una solicitud."
            : `Muestras disponibles en tu zona${rep.primary_region ? ` (${rep.primary_region})` : ""}. Toma una para tus citas.`}
        </p>
      </div>

      {isAdmin && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi icon={Package} label="Disponibles" value={disponibles.toLocaleString("es-MX")} accent />
          <Kpi icon={PackageOpen} label="Usadas (tomadas)" value={usadas.toLocaleString("es-MX")} />
          <Kpi icon={Wine} label="% de encartes" value={`${pctEncartes}%`} hint={`${encartadas} de ${usadas} usadas`} />
          <Kpi icon={Boxes} label="Zonas con stock" value={new Set(rows.map((r) => r.region ?? "Sin zona")).size.toLocaleString("es-MX")} />
        </div>
      )}

      <SampleBankClient rows={rows} isAdmin={isAdmin} accounts={accounts} metricsByRegion={metricsByRegion} lastUse={lastUse} history={historyByKey} />
    </div>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  accent,
  hint,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  accent?: boolean;
  hint?: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-start justify-between gap-3 p-4">
        <div className="space-y-1">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
          <div className={`font-display text-2xl ${accent ? "text-brand-carmesi" : ""}`}>{value}</div>
          {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
        </div>
        <Icon className="h-5 w-5 shrink-0 text-muted-foreground" />
      </CardContent>
    </Card>
  );
}
