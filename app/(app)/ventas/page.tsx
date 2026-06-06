// Ventas mensuales: resumen por vendedor + detalle por cliente, con selector
// de periodo. Admin ve todo; vendedor ve solo lo suyo (RLS de monthly_sales).

import Link from "next/link";
import { Upload, TrendingUp } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRep } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { formatCurrency } from "@/lib/utils";
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
  searchParams: { period?: string };
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

  let sales: MonthlySale[] = [];
  let reps: { id: string; full_name: string }[] = [];
  if (selected) {
    const [{ data: s }, { data: r }] = await Promise.all([
      supabase
        .from("monthly_sales")
        .select("*")
        .eq("period", selected)
        .order("venta_bruta", { ascending: false }),
      supabase.from("sales_reps").select("id, full_name"),
    ]);
    sales = (s ?? []) as MonthlySale[];
    reps = (r ?? []) as { id: string; full_name: string }[];
  }
  const repName = new Map(reps.map((r) => [r.id, r.full_name]));

  // Agrupa por vendedor.
  const byRep = new Map<string, { name: string; clientes: number; bruta: number; netoDesc: number }>();
  for (const v of sales) {
    const key = v.sales_rep_id ?? "sin";
    const e = byRep.get(key) ?? { name: v.sales_rep_id ? repName.get(v.sales_rep_id) ?? "—" : "Sin vendedor", clientes: 0, bruta: 0, netoDesc: 0 };
    e.clientes += 1;
    e.bruta += Number(v.venta_bruta ?? 0);
    e.netoDesc += Number(v.neto_desc ?? 0);
    byRep.set(key, e);
  }
  const repRows = Array.from(byRep.entries()).map(([id, v]) => ({ id, ...v })).sort((a, b) => b.bruta - a.bruta);
  const totalBruta = repRows.reduce((s, r) => s + r.bruta, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl">Ventas mensuales</h1>
          <p className="text-sm text-muted-foreground">
            {isAdmin ? "Ventas por vendedor, distribuidas por cliente." : "Tus ventas del periodo."}
          </p>
        </div>
        {isAdmin && (
          <Button asChild variant="outline">
            <Link href="/ventas/importar"><Upload className="mr-1 h-4 w-4" /> Importar ventas</Link>
          </Button>
        )}
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
              const short = p.slice(0, 7);
              const active = p === selected;
              return (
                <Link
                  key={p}
                  href={`/ventas?period=${short}`}
                  className={active
                    ? "rounded-full bg-brand-carmesi px-3 py-1 text-xs font-medium text-white"
                    : "rounded-full bg-muted px-3 py-1 text-xs text-foreground/70 hover:bg-muted/70"}
                >
                  {labelPeriod(p)}
                </Link>
              );
            })}
          </div>

          {/* Resumen por vendedor */}
          <Card><CardContent className="p-0">
            <div className="border-b p-4">
              <h2 className="font-display text-lg">Resumen por vendedor — {selected ? labelPeriod(selected) : ""}</h2>
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
                      <td className="px-4 py-2 font-medium">{r.name}</td>
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
                    <td className="px-4 py-2 text-right">{sales.length}</td>
                    <td className="px-4 py-2 text-right">{formatCurrency(totalBruta)}</td>
                    <td className="px-4 py-2 text-right">100%</td>
                    <td className="px-4 py-2 text-right">{formatCurrency(repRows.reduce((s, r) => s + r.netoDesc, 0))}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </CardContent></Card>

          {/* Detalle por cliente */}
          <Card><CardContent className="p-0">
            <div className="border-b p-4">
              <h2 className="font-display text-lg">Detalle por cliente</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 text-left"># Cliente</th>
                    <th className="px-4 py-2 text-left">Cliente</th>
                    {isAdmin && <th className="px-4 py-2 text-left">Vendedor</th>}
                    <th className="px-4 py-2 text-right">Venta bruta</th>
                    <th className="px-4 py-2 text-right">Descuento</th>
                    <th className="px-4 py-2 text-right">Neto-Desc.</th>
                  </tr>
                </thead>
                <tbody>
                  {sales.map((v) => (
                    <tr key={v.id} className="border-t hover:bg-muted/20">
                      <td className="px-4 py-2 font-mono text-xs">{v.client_number ?? "—"}</td>
                      <td className="px-4 py-2">
                        <Link href={`/cuentas/${v.account_id}`} className="hover:text-brand-carmesi">
                          {v.client_name ?? "—"}
                        </Link>
                      </td>
                      {isAdmin && <td className="px-4 py-2 text-muted-foreground">{v.sales_rep_id ? repName.get(v.sales_rep_id) ?? "—" : "—"}</td>}
                      <td className="px-4 py-2 text-right">{formatCurrency(v.venta_bruta)}</td>
                      <td className="px-4 py-2 text-right text-muted-foreground">{formatCurrency(v.descuento)}</td>
                      <td className="px-4 py-2 text-right">{formatCurrency(v.neto_desc)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent></Card>
        </>
      )}
    </div>
  );
}
