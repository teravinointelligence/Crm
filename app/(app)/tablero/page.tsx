// Tablero de KPIs en 3 niveles: Dirección (visión global), Vendedor (foco:
// disciplina comercial y cobertura de cartera) y Región. Reutiliza las fuentes
// de /reportes, /ventas, /cartera y /actividades vía lib/kpis/data.ts; las
// definiciones/fórmulas viven en lib/kpis/definitions.ts y las metas en
// config/kpi-targets.ts. Filtros de periodo y región por URL, como /reportes.
//
// Acceso: mismo gate que Reportes (admin y contador ven todo; un vendedor solo
// ve su propia tarjeta — RLS acota además sus datos server-side).

import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRep } from "@/lib/auth";
import { canViewReportes } from "@/lib/modules";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TableScroll } from "@/components/ui/table-scroll";
import { KpiStat } from "@/components/tablero/KpiStat";
import { VendedorCard } from "@/components/tablero/VendedorCard";
import { formatCurrency } from "@/lib/utils";
import { labelMonth, rangeFor, type Period } from "@/lib/kpis/period";
import { loadTablero } from "@/lib/kpis/data";
import { DIRECCION_TARGETS, REGION_TARGETS, semaforoKpi } from "@/config/kpi-targets";

export const metadata = { title: "Tablero de KPIs — TERAVINO CRM" };
export const dynamic = "force-dynamic";

const PERIODOS: { value: Period; label: string }[] = [
  { value: "mes", label: "Mes actual" },
  { value: "m3", label: "Últimos 3 meses" },
  { value: "m6", label: "Últimos 6 meses" },
  { value: "ytd", label: "Año actual" },
];

type Vista = "direccion" | "vendedores" | "regiones";
const VISTAS: { value: Vista; label: string }[] = [
  { value: "direccion", label: "Dirección" },
  { value: "vendedores", label: "Vendedores" },
  { value: "regiones", label: "Regiones" },
];

function pctDelta(actual: number, anterior: number): number | null {
  if (anterior <= 0) return null;
  return ((actual - anterior) / anterior) * 100;
}

export default async function TableroPage({
  searchParams,
}: {
  searchParams: { period?: string; region?: string; vista?: string };
}) {
  const rep = await getCurrentRep();
  if (!rep) redirect("/login");
  if (!canViewReportes(rep.role)) redirect("/");

  const fullView = rep.role === "admin" || rep.role === "contador";
  const supabase = createClient();

  const period: Period = searchParams.period ?? "mes";
  const range = rangeFor(period);
  const region = searchParams.region || null;
  const vistaParam = searchParams.vista as Vista | undefined;
  const vista: Vista = fullView
    ? (VISTAS.some((v) => v.value === vistaParam) ? vistaParam! : "direccion")
    : "vendedores"; // el vendedor solo tiene su tarjeta

  const data = await loadTablero(supabase, {
    range,
    region,
    fullView,
    selfRepId: rep.id,
  });
  const d = data.direccion;

  const href = (over: Partial<{ period: string; region: string | null; vista: string }>) => {
    const p = new URLSearchParams();
    p.set("period", over.period ?? period);
    const r = over.region === undefined ? region : over.region;
    if (r) p.set("region", r);
    p.set("vista", over.vista ?? vista);
    return `/tablero?${p.toString()}`;
  };

  // Metas mensuales × meses del periodo (venta y conteos por mes).
  const m = range.months;
  const T = DIRECCION_TARGETS;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl">Tablero de KPIs</h1>
          <p className="text-sm text-muted-foreground">
            {range.label} · {labelMonth(range.fromMonth)} → {labelMonth(range.toMonth)}
            {region ? ` · ${region}` : " · Todas las regiones"}
            {data.mesRef ? ` · último mes cargado: ${labelMonth(data.mesRef)}` : ""}
            {!fullView ? " · Tus indicadores" : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {/* Selector de periodo (mismo patrón de /reportes) */}
          <div className="flex flex-wrap gap-1.5 rounded-lg border bg-card p-1">
            {PERIODOS.map((p) => (
              <Link
                key={p.value}
                href={href({ period: p.value })}
                className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                  period === p.value
                    ? "bg-brand-carmesi text-white"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                {p.label}
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Selector de región */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs uppercase text-muted-foreground">Región:</span>
        <Link
          href={href({ region: null })}
          className={!region
            ? "rounded-full bg-brand-carmesi px-3 py-1 text-xs font-medium text-white"
            : "rounded-full bg-muted px-3 py-1 text-xs text-foreground/70 hover:bg-muted/70"}
        >
          Todas
        </Link>
        {data.regionesDisponibles.map((r) => (
          <Link
            key={r}
            href={href({ region: r })}
            className={region === r
              ? "rounded-full bg-brand-carmesi px-3 py-1 text-xs font-medium text-white"
              : "rounded-full bg-muted px-3 py-1 text-xs text-foreground/70 hover:bg-muted/70"}
          >
            {r}
          </Link>
        ))}
      </div>

      {/* Pestañas de nivel */}
      {fullView && (
        <div className="flex gap-1.5 border-b">
          {VISTAS.map((v) => (
            <Link
              key={v.value}
              href={href({ vista: v.value })}
              className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
                vista === v.value
                  ? "border-brand-carmesi text-brand-carmesi"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {v.label}
            </Link>
          ))}
        </div>
      )}

      {/* ================= NIVEL 1 — DIRECCIÓN ================= */}
      {vista === "direccion" && fullView && (
        <div className="space-y-6">
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <KpiStat
              label="Venta bruta"
              value={formatCurrency(d.ventaBruta)}
              rawValue={d.ventaBruta}
              target={{ ...T.venta_bruta, meta: T.venta_bruta.meta * m }}
              metaLabel={formatCurrency(T.venta_bruta.meta * m)}
              delta={pctDelta(d.ventaBruta, d.ventaBrutaPrev)}
              subtitle={`base comisión ${formatCurrency(d.baseComision)}`}
              frecuencia="mensual"
            />
            <KpiStat
              label="Crecimiento MoM"
              value={d.crecimientoMoM != null ? `${d.crecimientoMoM > 0 ? "+" : ""}${d.crecimientoMoM.toFixed(1)}%` : "—"}
              rawValue={d.crecimientoMoM}
              target={T.crecimiento_mom}
              metaLabel={`+${T.crecimiento_mom.meta}%`}
              subtitle={
                data.mesRef && data.mesPrev
                  ? `${labelMonth(data.mesRef)} vs ${labelMonth(data.mesPrev)}`
                  : "sin dos meses cargados"
              }
              frecuencia="mensual"
            />
            <KpiStat
              label="Ticket promedio"
              value={formatCurrency(d.ticketPromedio)}
              rawValue={d.ticketPromedio}
              target={T.ticket_promedio}
              metaLabel={formatCurrency(T.ticket_promedio.meta)}
              delta={pctDelta(d.ticketPromedio, d.ticketPromedioPrev)}
              subtitle="por cuenta con compra"
              frecuencia="mensual"
            />
            <KpiStat
              label="Cuentas con compra"
              value={`${d.cuentasConCompra} / ${d.cuentasActivas}`}
              rawValue={d.cuentasConCompra}
              target={T.cuentas_con_compra}
              metaLabel={`${T.cuentas_con_compra.meta}`}
              delta={pctDelta(d.cuentasConCompra, d.cuentasConCompraPrev)}
              subtitle="con compra / activas totales"
              frecuencia="mensual"
            />
          </section>

          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <KpiStat
              label="% cartera vencida"
              value={d.pctVencido != null ? `${d.pctVencido.toFixed(1)}%` : "—"}
              rawValue={d.pctVencido}
              target={T.pct_cartera_vencida}
              metaLabel={`≤${T.pct_cartera_vencida.meta}%`}
              lowerIsBetter
              subtitle={`${formatCurrency(d.saldoVencido)} de ${formatCurrency(d.saldoPendiente)} · KPI crítico`}
              frecuencia="semanal"
            />
            <KpiStat
              label="DSO (días de cobro)"
              value={d.dso != null ? `${Math.round(d.dso)} días` : "—"}
              rawValue={d.dso}
              target={T.dso}
              metaLabel={`≤${T.dso.meta} días`}
              lowerIsBetter
              subtitle="saldo pendiente / venta × días del periodo"
              frecuencia="semanal"
            />
            <KpiStat
              label="Cuentas en caída"
              value={String(d.cuentasCaida)}
              rawValue={d.cuentasCaida}
              target={T.cuentas_caida}
              metaLabel={`≤${T.cuentas_caida.meta}`}
              lowerIsBetter
              subtitle="dejaron de facturar o cayeron ≥50% vs su patrón"
              frecuencia="mensual"
            />
            <KpiStat
              label="Cuentas reactivadas"
              value={String(d.cuentasReactivadas)}
              rawValue={d.cuentasReactivadas}
              target={T.cuentas_reactivadas}
              metaLabel={`${T.cuentas_reactivadas.meta}`}
              subtitle={data.mesRef ? `volvieron a comprar en ${labelMonth(data.mesRef)}` : ""}
              frecuencia="mensual"
            />
          </section>

          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <KpiStat
              label="Productos en riesgo"
              value={String(d.productosRiesgo)}
              rawValue={d.productosRiesgo}
              target={T.productos_riesgo}
              metaLabel={`≤${T.productos_riesgo.meta}`}
              lowerIsBetter
              subtitle="riesgo de quiebre de stock (modelo de Restock)"
              frecuencia="semanal"
            />
            <KpiStat
              label="Pipeline en cotizaciones"
              value={formatCurrency(d.pipeline)}
              subtitle="cotizaciones abiertas (borrador/enviada)"
              frecuencia="mensual"
            />
            <KpiStat
              label="Cerrado del periodo"
              value={formatCurrency(d.cerrado)}
              subtitle="pedidos aceptados/facturados/entregados"
              frecuencia="mensual"
            />
            <KpiStat
              label="Conversión pipeline"
              value={d.conversion != null ? `${d.conversion.toFixed(0)}%` : "—"}
              rawValue={d.conversion}
              target={T.conversion_pipeline}
              metaLabel={`${T.conversion_pipeline.meta}%`}
              subtitle="cerrado / (cerrado + pipeline)"
              frecuencia="mensual"
            />
          </section>

          {/* Mix de producto */}
          <section>
            <Card>
              <CardContent className="p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <h3 className="font-display text-lg">Mix de producto</h3>
                    <p className="text-xs text-muted-foreground">
                      % de la venta del periodo por familia (detalle CONTPAQ × categoría del catálogo) · mensual
                    </p>
                  </div>
                </div>
                {d.mix.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sin detalle de producto cargado para el periodo.</p>
                ) : (
                  <div className="space-y-2">
                    {d.mix.map((s) => (
                      <div key={s.label} className="flex items-center gap-3">
                        <span className="w-24 shrink-0 text-sm font-medium">{s.label}</span>
                        <div className="h-3 flex-1 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-brand-carmesi"
                            style={{ width: `${Math.max(1, s.pct)}%` }}
                          />
                        </div>
                        <span className="w-32 shrink-0 text-right text-sm tabular-nums">
                          {s.pct.toFixed(1)}% · {formatCurrency(s.total)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </section>
        </div>
      )}

      {/* ================= NIVEL 2 — VENDEDORES (FOCO) ================= */}
      {vista === "vendedores" && (
        <div className="space-y-4">
          {fullView && (
            <p className="text-sm text-muted-foreground">
              Disciplina comercial y cobertura de cartera por vendedor. Los bloques de actividad y
              cuentas en riesgo son de seguimiento <strong>semanal</strong>; la venta, mensual.
            </p>
          )}
          {data.vendedores.length === 0 ? (
            <Card><CardContent className="p-6 text-sm text-muted-foreground">Sin vendedores activos.</CardContent></Card>
          ) : (
            data.vendedores.map((v) => <VendedorCard key={v.repId} v={v} />)
          )}
        </div>
      )}

      {/* ================= NIVEL 3 — REGIONES ================= */}
      {vista === "regiones" && fullView && (
        <Card>
          <CardContent className="p-0">
            <div className="border-b px-4 py-3">
              <h3 className="font-display text-lg">Desempeño por región</h3>
              <p className="text-xs text-muted-foreground">
                Venta del periodo, penetración de cuentas y salud de cartera. Vencido e inactivas: seguimiento semanal.
              </p>
            </div>
            <TableScroll className="rounded-none border-0">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 text-left">Región</th>
                    <th className="px-4 py-2 text-right">Venta bruta</th>
                    <th className="px-4 py-2 text-right">% del total</th>
                    <th className="px-4 py-2 text-right">MoM</th>
                    <th className="px-4 py-2 text-right">Cuentas activas</th>
                    <th className="px-4 py-2 text-right">Penetración</th>
                    <th className="px-4 py-2 text-right">Monto vencido</th>
                    <th className="px-4 py-2 text-right">% vencido</th>
                    <th className="px-4 py-2 text-right">Inactivas 30+</th>
                  </tr>
                </thead>
                <tbody>
                  {data.regiones.map((r) => {
                    const mom = pctDelta(r.ventaMesRef, r.ventaMesPrev);
                    const semPen = r.penetracion != null ? semaforoKpi(r.penetracion, REGION_TARGETS.penetracion) : null;
                    const semVen = r.pctVencido != null ? semaforoKpi(r.pctVencido, REGION_TARGETS.pct_vencido) : null;
                    return (
                      <tr key={r.region} className="border-t hover:bg-muted/20">
                        <td className="px-4 py-2 font-medium">
                          <Link href={href({ region: r.region, vista: "vendedores" })} className="hover:text-brand-carmesi">
                            {r.region}
                          </Link>
                        </td>
                        <td className="px-4 py-2 text-right font-medium">{formatCurrency(r.ventaBruta)}</td>
                        <td className="px-4 py-2 text-right text-muted-foreground">
                          {r.pctDelTotal != null ? `${r.pctDelTotal.toFixed(1)}%` : "—"}
                        </td>
                        <td className={`px-4 py-2 text-right ${mom == null ? "text-muted-foreground" : mom >= 0 ? "text-emerald-700" : "text-red-600"}`}>
                          {mom != null ? `${mom > 0 ? "+" : ""}${mom.toFixed(1)}%` : "—"}
                        </td>
                        <td className="px-4 py-2 text-right">{r.cuentasActivas}</td>
                        <td className="px-4 py-2 text-right">
                          {r.penetracion != null ? (
                            <Badge variant={semPen === "verde" ? "success" : semPen === "ambar" ? "warning" : "danger"}>
                              {`${Math.round(r.penetracion)}% (${r.cuentasConCompra})`}
                            </Badge>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-4 py-2 text-right font-medium">{formatCurrency(r.montoVencido)}</td>
                        <td className="px-4 py-2 text-right">
                          {r.pctVencido != null ? (
                            <Badge variant={semVen === "verde" ? "success" : semVen === "ambar" ? "warning" : "danger"}>
                              {`${r.pctVencido.toFixed(1)}%`}
                            </Badge>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className={`px-4 py-2 text-right ${r.inactivas > 0 ? "text-amber-700" : ""}`}>{r.inactivas}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TableScroll>
          </CardContent>
        </Card>
      )}

      <p className="text-xs text-muted-foreground">
        Fórmulas y fuentes de cada KPI: ver docs/tablero-kpis.md · Metas editables en config/kpi-targets.ts.
      </p>
    </div>
  );
}
