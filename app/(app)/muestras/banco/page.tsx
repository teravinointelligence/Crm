import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Boxes, PackageOpen, Package, Wine } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRep } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SampleBankClient, type BankRow, type RegionMetrics } from "@/components/samples/SampleBankClient";

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
      .select("product_id, region, quantity, kind, account_id")
      .eq("kind", "toma"),
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
  const tomas = (movData ?? []) as { product_id: string; region: string | null; quantity: number | string; account_id: string | null }[];
  let usadas = 0;
  let encartadas = 0;
  const byRegion = new Map<string, RegionMetrics>();
  for (const t of tomas) {
    const used = -Number(t.quantity ?? 0);
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
      <Button asChild variant="ghost" size="sm">
        <Link href="/muestras"><ArrowLeft className="mr-1 h-4 w-4" /> Muestras</Link>
      </Button>
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

      <SampleBankClient rows={rows} isAdmin={isAdmin} accounts={accounts} metricsByRegion={metricsByRegion} />
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
