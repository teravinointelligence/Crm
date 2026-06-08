// Reportes de Reparto: KPIs por periodo, tendencia diaria y ranking de choferes.

import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentRep } from "@/lib/auth";
import { canAccessReparto } from "@/lib/modules";
import { repartoAdmin } from "@/lib/supabase-reparto";
import { Card, CardContent } from "@/components/ui/card";
import { CategoryBarChart, MonthlyBarChart } from "@/components/reports/Charts";
import { ESTATUS_LABEL, type PedidoEstatus } from "@/types/reparto";
import { formatCurrency } from "@/lib/utils";

export const metadata = { title: "Reportes Reparto" };
export const dynamic = "force-dynamic";

type Period = "30" | "90" | "ytd";

function rangeFor(p: Period) {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  if (p === "ytd") return { from: `${now.getFullYear()}-01-01`, to: today, label: `Año ${now.getFullYear()}` };
  const days = p === "30" ? 30 : 90;
  const from = new Date();
  from.setDate(from.getDate() - days);
  return { from: from.toISOString().slice(0, 10), to: today, label: `Últimos ${days} días` };
}

const PERIODS: { value: Period; label: string }[] = [
  { value: "30", label: "30 días" },
  { value: "90", label: "90 días" },
  { value: "ytd", label: "Año actual" },
];

export default async function ReportesRepartoPage({
  searchParams,
}: {
  searchParams: { period?: Period };
}) {
  const rep = await getCurrentRep();
  if (!rep) redirect("/login");
  if (!canAccessReparto(rep.role)) redirect("/");

  const period = (searchParams.period && ["30", "90", "ytd"].includes(searchParams.period) ? searchParams.period : "30") as Period;
  const range = rangeFor(period);

  const [pedidosRes, choferesRes, entregasRes] = await Promise.all([
    repartoAdmin
      .from("pedidos")
      .select("id, fecha, estatus, total, chofer_id")
      .gte("fecha", range.from)
      .lte("fecha", range.to),
    repartoAdmin
      .from("usuarios")
      .select("id, nombre")
      .eq("es_chofer", true),
    repartoAdmin
      .from("entregas")
      .select("id, chofer_id, timestamp_entrega, compartido_whatsapp")
      .gte("timestamp_entrega", `${range.from}T00:00:00`)
      .lte("timestamp_entrega", `${range.to}T23:59:59`),
  ]);

  const pedidos = (pedidosRes.data ?? []) as Array<{ fecha: string; estatus: PedidoEstatus; total: number | null; chofer_id: string | null }>;
  const choferes = (choferesRes.data ?? []) as Array<{ id: string; nombre: string }>;
  const entregas = (entregasRes.data ?? []) as Array<{ chofer_id: string | null; timestamp_entrega: string | null; compartido_whatsapp: boolean | null }>;

  const totalPedidos = pedidos.length;
  const entregados = pedidos.filter((p) => p.estatus === "entregado").length;
  const noEntregados = pedidos.filter((p) => p.estatus === "no_entregado").length;
  const enProceso = pedidos.filter((p) => ["pendiente_asignar", "asignado", "en_ruta"].includes(p.estatus)).length;
  const facturado = pedidos.reduce((s, p) => s + (Number(p.total) || 0), 0);
  const pctEntregados = totalPedidos ? Math.round((entregados / totalPedidos) * 1000) / 10 : 0;
  const pctWhatsApp = entregas.length ? Math.round((entregas.filter((e) => e.compartido_whatsapp).length / entregas.length) * 1000) / 10 : 0;

  // Tendencia diaria (todas las fechas dentro del rango)
  const fromDate = new Date(range.from);
  const toDate = new Date(range.to);
  const dayMs = 86400000;
  const dailyMap = new Map<string, number>();
  for (let d = new Date(fromDate); d <= toDate; d = new Date(d.getTime() + dayMs)) {
    dailyMap.set(d.toISOString().slice(0, 10), 0);
  }
  for (const e of entregas) {
    if (!e.timestamp_entrega) continue;
    const k = e.timestamp_entrega.slice(0, 10);
    if (dailyMap.has(k)) dailyMap.set(k, (dailyMap.get(k) ?? 0) + 1);
  }
  const dailyData = [...dailyMap.entries()].map(([k, v]) => ({
    label: new Date(k).toLocaleDateString("es-MX", { day: "2-digit", month: "short" }),
    value: v,
  }));

  // Ranking choferes
  const choferMap = new Map<string, { nombre: string; entregados: number; asignados: number; facturado: number; entregasReg: number }>();
  for (const c of choferes) choferMap.set(c.id, { nombre: c.nombre, entregados: 0, asignados: 0, facturado: 0, entregasReg: 0 });
  for (const p of pedidos) {
    if (!p.chofer_id) continue;
    const r = choferMap.get(p.chofer_id);
    if (!r) continue;
    r.asignados++;
    if (p.estatus === "entregado") { r.entregados++; r.facturado += Number(p.total) || 0; }
  }
  for (const e of entregas) {
    if (!e.chofer_id) continue;
    const r = choferMap.get(e.chofer_id);
    if (r) r.entregasReg++;
  }
  const ranking = [...choferMap.entries()]
    .map(([id, r]) => ({ id, ...r, pct: r.asignados ? Math.round((r.entregados / r.asignados) * 1000) / 10 : 0 }))
    .filter((r) => r.asignados > 0 || r.entregasReg > 0)
    .sort((a, b) => b.entregados - a.entregados);

  // Estatus actual distribución
  const estatusDist: PedidoEstatus[] = ["pendiente_asignar", "asignado", "en_ruta", "entregado", "no_entregado"];
  const estatusData = estatusDist.map((s) => ({
    label: ESTATUS_LABEL[s],
    value: pedidos.filter((p) => p.estatus === s).length,
  }));

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl">Reportes de reparto</h1>
          <p className="text-sm text-muted-foreground">{range.label} · {range.from} → {range.to}</p>
        </div>
        <div className="flex flex-wrap gap-1.5 rounded-lg border bg-card p-1">
          {PERIODS.map((p) => {
            const active = period === p.value;
            return (
              <Link
                key={p.value}
                href={`/reparto/reportes?period=${p.value}`}
                className={`rounded-md px-3 py-1.5 text-sm transition-colors ${active ? "bg-brand-carmesi text-white" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
              >
                {p.label}
              </Link>
            );
          })}
        </div>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Pedidos" value={totalPedidos.toString()} subtitle={`facturado ${formatCurrency(facturado)}`} />
        <Kpi label="Entregados" value={`${entregados}`} subtitle={`${pctEntregados}% de cumplimiento`} tone="ok" />
        <Kpi label="No entregados" value={noEntregados.toString()} tone={noEntregados > 0 ? "danger" : "default"} />
        <Kpi label="En proceso" value={enProceso.toString()} subtitle="pendientes/asignados/en ruta" tone="accent" />
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <CategoryBarChart
          title="Distribución por estatus"
          subtitle="Pedidos en el periodo"
          data={estatusData}
          valueFormat="integer"
        />
        <Card><CardContent className="space-y-1 p-5">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Comprobantes por WhatsApp</p>
          <p className="font-display text-3xl text-emerald-700">{pctWhatsApp}%</p>
          <p className="text-xs text-muted-foreground">{entregas.length} entregas registradas en el rango</p>
        </CardContent></Card>
      </section>

      <section>
        <MonthlyBarChart
          title="Entregas registradas por día"
          subtitle={`Bitácora dentro del periodo (${entregas.length} totales)`}
          data={dailyData}
        />
      </section>

      <section>
        <Card><CardContent className="p-0">
          <div className="border-b px-4 py-3">
            <h3 className="font-display text-lg">Ranking de choferes</h3>
            <p className="text-xs text-muted-foreground">Pedidos asignados, entregas confirmadas y % de cumplimiento.</p>
          </div>
          {ranking.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">Sin actividad de choferes en este rango.</p>
          ) : (
            <table className="min-w-full text-sm">
              <thead className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-2">Chofer</th>
                  <th className="px-4 py-2 text-right">Asignados</th>
                  <th className="px-4 py-2 text-right">Entregados</th>
                  <th className="px-4 py-2 text-right">% Éxito</th>
                  <th className="px-4 py-2 text-right">Bitácora</th>
                  <th className="px-4 py-2 text-right">Facturado</th>
                </tr>
              </thead>
              <tbody>
                {ranking.map((r) => (
                  <tr key={r.id} className="border-b last:border-b-0">
                    <td className="px-4 py-2 font-medium">{r.nombre}</td>
                    <td className="px-4 py-2 text-right text-muted-foreground">{r.asignados}</td>
                    <td className="px-4 py-2 text-right">{r.entregados}</td>
                    <td className="px-4 py-2 text-right">{r.pct}%</td>
                    <td className="px-4 py-2 text-right text-muted-foreground">{r.entregasReg}</td>
                    <td className="px-4 py-2 text-right font-medium">{formatCurrency(r.facturado)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent></Card>
      </section>
    </div>
  );
}

function Kpi({ label, value, subtitle, tone = "default" }: { label: string; value: string; subtitle?: string; tone?: "default" | "accent" | "ok" | "danger" }) {
  const cls =
    tone === "danger" ? "text-red-700" :
    tone === "ok" ? "text-emerald-700" :
    tone === "accent" ? "text-brand-carmesi" :
    "text-brand-carmesi";
  return (
    <Card><CardContent className="space-y-1 p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`font-display text-2xl ${cls}`}>{value}</p>
      {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
    </CardContent></Card>
  );
}
