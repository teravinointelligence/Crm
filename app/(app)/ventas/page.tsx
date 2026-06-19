// Ventas mensuales: dos cortes complementarios.
//  - Por mes (default): pick un periodo → resumen por vendedor + detalle por
//    cliente de ese mes.
//  - Por vendedor: pick un vendedor → su histórico mes a mes + el detalle por
//    cliente del periodo seleccionado, ya filtrado a ese vendedor.
// Admin ve todo; vendedor ve solo lo suyo (RLS de monthly_sales).

import Link from "next/link";
import { Upload, TrendingUp, Scale } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRep } from "@/lib/auth";
import { SELLER_ROLES } from "@/lib/modules";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { formatCurrency } from "@/lib/utils";
import { MonthlySalesDetail } from "@/components/ventas/MonthlySalesDetail";
import type { MonthlySale } from "@/types/database";

export const metadata = { title: "Ventas — TERAVINO CRM" };
export const dynamic = "force-dynamic";

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

function labelPeriod(p: string) {
  const [y, m] = p.split("-").map(Number);
  return `${MESES[m - 1]} ${y}`;
}

export default async function VentasPage({
  searchParams,
}: {
  searchParams: { period?: string; rep?: string };
}) {
  const supabase = createClient();
  const rep = await getCurrentRep();
  const isAdmin = rep?.role === "admin";

  // Periodos disponibles (distinct period). Si no hay filtro, usa el más reciente.
  const { data: periodsRaw } = await supabase
    .from("monthly_sales")
    .select("period")
    .order("period", { ascending: false })
    .limit(2000);
  const periods = Array.from(new Set((periodsRaw ?? []).map((r) => r.period as string)));
  const selected = searchParams.period && periods.includes(`${searchParams.period}-01`)
    ? `${searchParams.period}-01`
    : periods[0] ?? null;

  // Vendedores (solo roles que llevan cartera) para el selector y el mapa de nombres.
  const { data: repsRaw } = await supabase
    .from("sales_reps")
    .select("id, full_name")
    .in("role", SELLER_ROLES)
    .order("full_name");
  const reps = (repsRaw ?? []) as { id: string; full_name: string }[];
  const repName = new Map(reps.map((r) => [r.id, r.full_name]));

  // Vendedor seleccionado (debe existir en la lista). null = "Todos".
  const selectedRepId = searchParams.rep && repName.has(searchParams.rep)
    ? searchParams.rep
    : null;

  // Ventas del periodo seleccionado (todos los vendedores).
  let salesMonth: MonthlySale[] = [];
  if (selected) {
    const { data: s } = await supabase
      .from("monthly_sales")
      .select("*")
      .eq("period", selected)
      .order("venta_bruta", { ascending: false });
    salesMonth = (s ?? []) as MonthlySale[];
  }

  // Resumen por vendedor del mes (vista "Todos").
  const byRep = new Map<string, { name: string; clientes: number; bruta: number; netoDesc: number }>();
  for (const v of salesMonth) {
    const key = v.sales_rep_id ?? "sin";
    const e = byRep.get(key) ?? { name: v.sales_rep_id ? repName.get(v.sales_rep_id) ?? "—" : "Sin vendedor", clientes: 0, bruta: 0, netoDesc: 0 };
    e.clientes += 1;
    e.bruta += Number(v.venta_bruta ?? 0);
    e.netoDesc += Number(v.neto_desc ?? 0);
    byRep.set(key, e);
  }
  const repRows = Array.from(byRep.entries()).map(([id, v]) => ({ id, ...v })).sort((a, b) => b.bruta - a.bruta);
  const totalBruta = repRows.reduce((s, r) => s + r.bruta, 0);

  // Histórico mes a mes del vendedor seleccionado (todos los periodos).
  let history: { period: string; clientes: number; bruta: number; base: number }[] = [];
  if (selectedRepId) {
    const { data: hr } = await supabase
      .from("monthly_sales")
      .select("period, venta_bruta, neto_desc")
      .eq("sales_rep_id", selectedRepId);
    const byPeriod = new Map<string, { clientes: number; bruta: number; base: number }>();
    for (const row of (hr ?? []) as { period: string; venta_bruta: number | null; neto_desc: number | null }[]) {
      const e = byPeriod.get(row.period) ?? { clientes: 0, bruta: 0, base: 0 };
      e.clientes += 1;
      e.bruta += Number(row.venta_bruta ?? 0);
      e.base += Number(row.neto_desc ?? 0);
      byPeriod.set(row.period, e);
    }
    history = Array.from(byPeriod.entries())
      .map(([period, v]) => ({ period, ...v }))
      .sort((a, b) => b.period.localeCompare(a.period));
  }
  const histTotal = history.reduce(
    (acc, h) => ({ clientes: acc.clientes + h.clientes, bruta: acc.bruta + h.bruta, base: acc.base + h.base }),
    { clientes: 0, bruta: 0, base: 0 },
  );

  // Detalle por cliente: del periodo seleccionado, filtrado al vendedor si aplica.
  const detailSales = selectedRepId
    ? salesMonth.filter((v) => v.sales_rep_id === selectedRepId)
    : salesMonth;

  const shortSel = selected ? selected.slice(0, 7) : "";
  const monthHref = (short: string) =>
    `/ventas?period=${short}${selectedRepId ? `&rep=${selectedRepId}` : ""}`;
  const repHref = (id: string | null) =>
    `/ventas?period=${shortSel}${id ? `&rep=${id}` : ""}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl">Ventas mensuales</h1>
          <p className="text-sm text-muted-foreground">
            {isAdmin ? "Ventas por vendedor, distribuidas por cliente." : "Tus ventas del periodo."}
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/ventas/conciliacion"><Scale className="mr-1 h-4 w-4" /> Conciliar vs cartera</Link>
          </Button>
          {isAdmin && (
            <Button asChild variant="outline">
              <Link href="/ventas/importar"><Upload className="mr-1 h-4 w-4" /> Importar ventas</Link>
            </Button>
          )}
        </div>
      </div>

      {periods.length === 0 ? (
        <EmptyState
          icon={TrendingUp}
          title="Sin ventas cargadas"
          description="Importa el reporte mensual de ventas por vendedor (CONTPAQ) para empezar."
          action={isAdmin ? (
            <Button asChild className="mt-2"><Link href="/ventas/importar"><Upload className="mr-1 h-4 w-4" /> Importar ventas</Link></Button>
          ) : undefined}
        />
      ) : (
        <>
          {/* Selector de periodo */}
          <div className="flex flex-wrap gap-2">
            {periods.map((p) => {
              const active = p === selected;
              return (
                <Link
                  key={p}
                  href={monthHref(p.slice(0, 7))}
                  className={active
                    ? "rounded-full bg-brand-carmesi px-3 py-1 text-xs font-medium text-white"
                    : "rounded-full bg-muted px-3 py-1 text-xs text-foreground/70 hover:bg-muted/70"}
                >
                  {labelPeriod(p)}
                </Link>
              );
            })}
          </div>

          {/* Selector de vendedor (admin): cambia a la vista por vendedor */}
          {isAdmin && reps.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs uppercase text-muted-foreground">Vendedor:</span>
              <Link
                href={repHref(null)}
                className={!selectedRepId
                  ? "rounded-full bg-brand-carmesi px-3 py-1 text-xs font-medium text-white"
                  : "rounded-full bg-muted px-3 py-1 text-xs text-foreground/70 hover:bg-muted/70"}
              >
                Todos
              </Link>
              {reps.map((r) => {
                const active = r.id === selectedRepId;
                return (
                  <Link
                    key={r.id}
                    href={repHref(r.id)}
                    className={active
                      ? "rounded-full bg-brand-carmesi px-3 py-1 text-xs font-medium text-white"
                      : "rounded-full bg-muted px-3 py-1 text-xs text-foreground/70 hover:bg-muted/70"}
                  >
                    {r.full_name}
                  </Link>
                );
              })}
            </div>
          )}

          {selectedRepId ? (
            /* Vista por vendedor: histórico mes a mes */
            <Card><CardContent className="p-0">
              <div className="border-b p-4">
                <h2 className="font-display text-lg">
                  Ventas por mes — {repName.get(selectedRepId) ?? "Vendedor"}
                </h2>
                <p className="text-xs text-muted-foreground">Toca un mes para ver su detalle por cliente.</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/30 text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2 text-left">Mes</th>
                      <th className="px-4 py-2 text-right">Clientes</th>
                      <th className="px-4 py-2 text-right">Venta bruta</th>
                      <th className="px-4 py-2 text-right">Base comisión</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                          Este vendedor no tiene ventas registradas.
                        </td>
                      </tr>
                    ) : (
                      history.map((h) => {
                        const active = h.period === selected;
                        return (
                          <tr key={h.period} className={active ? "border-t bg-brand-carmesi/5" : "border-t hover:bg-muted/20"}>
                            <td className="px-4 py-2 font-medium">
                              <Link href={monthHref(h.period.slice(0, 7))} className="hover:text-brand-carmesi">
                                {labelPeriod(h.period)}
                              </Link>
                            </td>
                            <td className="px-4 py-2 text-right">{h.clientes}</td>
                            <td className="px-4 py-2 text-right">{formatCurrency(h.bruta)}</td>
                            <td className="px-4 py-2 text-right">{formatCurrency(h.base)}</td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                  {history.length > 0 && (
                    <tfoot>
                      <tr className="border-t bg-muted/30 font-medium">
                        <td className="px-4 py-2">TOTAL ({history.length} {history.length === 1 ? "mes" : "meses"})</td>
                        <td className="px-4 py-2 text-right">{histTotal.clientes}</td>
                        <td className="px-4 py-2 text-right">{formatCurrency(histTotal.bruta)}</td>
                        <td className="px-4 py-2 text-right">{formatCurrency(histTotal.base)}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </CardContent></Card>
          ) : (
            /* Vista por mes: resumen por vendedor (clic en el nombre → su histórico) */
            <Card><CardContent className="p-0">
              <div className="border-b p-4">
                <h2 className="font-display text-lg">Resumen por vendedor — {selected ? labelPeriod(selected) : ""}</h2>
                {isAdmin && <p className="text-xs text-muted-foreground">Toca un vendedor para ver su histórico mes a mes.</p>}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/30 text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2 text-left">Vendedor</th>
                      <th className="px-4 py-2 text-right">Clientes</th>
                      <th className="px-4 py-2 text-right">Venta bruta</th>
                      <th className="px-4 py-2 text-right">% del total</th>
                      <th className="px-4 py-2 text-right">Base comisión</th>
                    </tr>
                  </thead>
                  <tbody>
                    {repRows.map((r) => (
                      <tr key={r.id} className="border-t">
                        <td className="px-4 py-2 font-medium">
                          {isAdmin && r.id !== "sin" ? (
                            <Link href={repHref(r.id)} className="hover:text-brand-carmesi">{r.name}</Link>
                          ) : (
                            r.name
                          )}
                        </td>
                        <td className="px-4 py-2 text-right">{r.clientes}</td>
                        <td className="px-4 py-2 text-right">{formatCurrency(r.bruta)}</td>
                        <td className="px-4 py-2 text-right text-muted-foreground">
                          {totalBruta > 0 ? `${((r.bruta / totalBruta) * 100).toFixed(1)}%` : "—"}
                        </td>
                        <td className="px-4 py-2 text-right">{formatCurrency(r.netoDesc)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t bg-muted/30 font-medium">
                      <td className="px-4 py-2">TOTAL</td>
                      <td className="px-4 py-2 text-right">{salesMonth.length}</td>
                      <td className="px-4 py-2 text-right">{formatCurrency(totalBruta)}</td>
                      <td className="px-4 py-2 text-right">100%</td>
                      <td className="px-4 py-2 text-right">{formatCurrency(repRows.reduce((s, r) => s + r.netoDesc, 0))}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </CardContent></Card>
          )}

          {/* Detalle por cliente del periodo (filtrado al vendedor si hay uno) */}
          <MonthlySalesDetail sales={detailSales} reps={reps} isAdmin={isAdmin} />
        </>
      )}
    </div>
  );
}
