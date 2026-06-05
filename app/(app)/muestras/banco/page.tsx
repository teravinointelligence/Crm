import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Package, PackageOpen, Boxes, Wine } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRep } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SampleBankZones, type Zone, type StockRow } from "@/components/samples/SampleBankZones";

export const metadata = { title: "Banco de muestras — TERAVINO CRM" };

type Movement = {
  product_id: string;
  product_name: string;
  supplier: string | null;
  region: string | null;
  location: string | null;
  quantity: number | string;
  kind: string;
  account_id: string | null;
};

export default async function SampleBankPage() {
  const supabase = createClient();
  const rep = await getCurrentRep();
  if (!rep) redirect("/login");
  const isAdmin = rep.role === "admin";

  const [{ data: movData }, { data: encData }, { data: acctData }] = await Promise.all([
    supabase
      .from("sample_bank_movements")
      .select("product_id, product_name, supplier, region, location, quantity, kind, account_id")
      .order("created_at", { ascending: true }),
    supabase.from("account_products").select("account_id, product_id").eq("status", "encartado"),
    supabase.from("accounts").select("id, business_name, region").order("business_name"),
  ]);

  const movements = (movData ?? []) as Movement[];
  const encartado = new Set((encData ?? []).map((e) => `${e.account_id}|${e.product_id}`));
  const accounts = (acctData ?? []) as { id: string; business_name: string; region: string | null }[];

  // Stock disponible por (zona, producto). Ubicación = la del grupo (última no nula).
  const stock = new Map<string, StockRow & { _loc: string | null }>();
  let ingresadas = 0;
  let usadas = 0;
  let encartadas = 0;
  const zoneUsage = new Map<string, { usadas: number; encartadas: number }>();

  for (const m of movements) {
    const q = Number(m.quantity ?? 0);
    const region = m.region ?? "Sin zona";
    const key = `${region}|${m.product_id}`;
    const cur = stock.get(key) ?? {
      productId: m.product_id,
      productName: m.product_name,
      supplier: m.supplier,
      region: m.region,
      location: null,
      available: 0,
      _loc: null,
    };
    if (m.kind === "ingreso") {
      cur.available += q;
      ingresadas += q;
    } else {
      cur.available -= q;
      usadas += q;
      const zu = zoneUsage.get(region) ?? { usadas: 0, encartadas: 0 };
      zu.usadas += q;
      const isEnc = m.account_id && encartado.has(`${m.account_id}|${m.product_id}`);
      if (isEnc) { zu.encartadas += q; encartadas += q; }
      zoneUsage.set(region, zu);
    }
    if (m.location) cur._loc = m.location; // gana la última ubicación registrada del grupo
    cur.location = cur._loc;
    stock.set(key, cur);
  }

  // Agrupar filas por zona, mostrando sólo lo que alguna vez entró al banco.
  const byZone = new Map<string, StockRow[]>();
  for (const row of stock.values()) {
    const region = row.region ?? "Sin zona";
    const list = byZone.get(region) ?? [];
    list.push(row);
    byZone.set(region, list);
  }

  const zones: Zone[] = [...byZone.entries()]
    .map(([region, rows]) => ({
      region,
      rows: rows.sort((a, b) => a.productName.localeCompare(b.productName)),
      usadas: zoneUsage.get(region)?.usadas ?? 0,
      encartadas: zoneUsage.get(region)?.encartadas ?? 0,
    }))
    .sort((a, b) => a.region.localeCompare(b.region));

  const disponibles = ingresadas - usadas;
  const pctEncartes = usadas ? Math.round((encartadas / usadas) * 100) : 0;

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href="/muestras"><ArrowLeft className="mr-1 h-4 w-4" /> Muestras</Link>
      </Button>

      <div>
        <h1 className="font-display text-3xl">Banco de muestras</h1>
        <p className="text-sm text-muted-foreground">
          Botellas de muestra disponibles por zona. Entran al banco cuando autorizas una solicitud.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi icon={Boxes} label="Ingresadas al banco" value={ingresadas.toLocaleString("es-MX")} />
        <Kpi icon={PackageOpen} label="Usadas (tomadas)" value={usadas.toLocaleString("es-MX")} />
        <Kpi icon={Package} label="Disponibles" value={disponibles.toLocaleString("es-MX")} accent />
        <Kpi icon={Wine} label="% de encartes" value={`${pctEncartes}%`} hint={`${encartadas} de ${usadas} usadas`} />
      </div>

      {zones.length === 0 ? (
        <EmptyState
          icon={Package}
          title="El banco está vacío"
          description="Cuando autorices una solicitud de muestras, las botellas entrarán aquí."
        />
      ) : (
        <SampleBankZones zones={zones} accounts={accounts} repId={rep.id} isAdmin={isAdmin} />
      )}
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
