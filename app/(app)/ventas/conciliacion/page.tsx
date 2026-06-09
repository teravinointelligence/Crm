// Conciliación Ventas ↔ Cartera. Cruza por cuenta y mes lo VENDIDO
// (monthly_sales) contra lo FACTURADO en cartera (invoices con invoice_date en
// el mes): cobrado, saldo pendiente y diferencia vendido−facturado. No usa
// folios (los reportes de ventas no los traen); empareja por account_id.
// RLS: admin/contador ven todo; un vendedor solo sus cuentas.

import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, AlertTriangle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRep } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { TrendingUp } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

export const metadata = { title: "Conciliación ventas ↔ cartera — TERAVINO CRM" };
export const dynamic = "force-dynamic";

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];
function labelPeriod(p: string) {
  const [y, m] = p.split("-").map(Number);
  return `${MESES[m - 1]} ${y}`;
}
function monthEnd(periodStart: string): string {
  const [y, m] = periodStart.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); // último día del mes
}

type Estado = "conciliado" | "falta_facturar" | "facturado_de_mas" | "sin_factura" | "sin_venta";
const ESTADO_META: Record<Estado, { label: string; cls: string }> = {
  conciliado:       { label: "Conciliado",          cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  falta_facturar:   { label: "Falta facturar",      cls: "bg-amber-50 text-amber-800 border-amber-200" },
  facturado_de_mas: { label: "Facturado de más",    cls: "bg-orange-50 text-orange-800 border-orange-200" },
  sin_factura:      { label: "Vendido sin factura", cls: "bg-red-50 text-red-700 border-red-200" },
  sin_venta:        { label: "Factura sin venta",   cls: "bg-slate-100 text-slate-600 border-slate-200" },
};

type Row = {
  accountId: string;
  name: string;
  repId: string | null;
  vendido: number;
  facturado: number;
  cobrado: number;
  pendiente: number;
  nFacturas: number;
  diferencia: number;
  estado: Estado;
};

function estadoDe(vendido: number, facturado: number, nFacturas: number): { diferencia: number; estado: Estado } {
  const diferencia = Math.round((vendido - facturado) * 100) / 100;
  const tol = Math.max(50, vendido * 0.005);
  let estado: Estado;
  if (vendido > 0 && nFacturas === 0) estado = "sin_factura";
  else if (vendido === 0 && facturado > 0) estado = "sin_venta";
  else if (Math.abs(diferencia) <= tol) estado = "conciliado";
  else if (diferencia > 0) estado = "falta_facturar";
  else estado = "facturado_de_mas";
  return { diferencia, estado };
}

export default async function ConciliacionVentasPage({
  searchParams,
}: {
  searchParams: { period?: string; solo?: string };
}) {
  const rep = await getCurrentRep();
  if (!rep) redirect("/login");
  const supabase = createClient();

  // Periodos disponibles (de ventas cargadas).
  const { data: periodsRaw } = await supabase
    .from("monthly_sales")
    .select("period")
    .order("period", { ascending: false })
    .limit(2000);
  const periods = Array.from(new Set((periodsRaw ?? []).map((r) => r.period as string)));
  const selected = searchParams.period && periods.includes(`${searchParams.period}-01`)
    ? `${searchParams.period}-01`
    : periods[0] ?? null;
  const soloDif = searchParams.solo === "dif";

  let rows: Row[] = [];
  let repName = new Map<string, string>();

  if (selected) {
    const end = monthEnd(selected);
    const [{ data: sales }, { data: invoices }, { data: reps }] = await Promise.all([
      supabase.from("monthly_sales").select("account_id, sales_rep_id, client_name, venta_bruta").eq("period", selected),
      supabase.from("invoices").select("account_id, total, total_paid, balance").gte("invoice_date", selected).lte("invoice_date", end),
      supabase.from("sales_reps").select("id, full_name"),
    ]);
    repName = new Map((reps ?? []).map((r) => [r.id as string, r.full_name as string]));

    // Cuentas involucradas (de ventas o de facturas) → nombre + vendedor canónico.
    const accIds = Array.from(new Set([
      ...(sales ?? []).map((s) => s.account_id as string),
      ...(invoices ?? []).map((i) => i.account_id as string),
    ].filter(Boolean)));
    const accInfo = new Map<string, { name: string; repId: string | null }>();
    for (let i = 0; i < accIds.length; i += 500) {
      const chunk = accIds.slice(i, i + 500);
      const { data: accs } = await supabase
        .from("accounts")
        .select("id, business_name, assigned_rep_id")
        .in("id", chunk);
      for (const a of accs ?? []) {
        accInfo.set(a.id as string, { name: (a.business_name as string) ?? "—", repId: (a.assigned_rep_id as string) ?? null });
      }
    }

    const agg = new Map<string, Row>();
    const ensure = (accountId: string, fallbackName: string, fallbackRep: string | null): Row => {
      let r = agg.get(accountId);
      if (!r) {
        const info = accInfo.get(accountId);
        r = {
          accountId,
          name: info?.name ?? fallbackName ?? "—",
          repId: info?.repId ?? fallbackRep,
          vendido: 0, facturado: 0, cobrado: 0, pendiente: 0, nFacturas: 0,
          diferencia: 0, estado: "conciliado",
        };
        agg.set(accountId, r);
      }
      return r;
    };

    for (const s of sales ?? []) {
      const r = ensure(s.account_id as string, (s.client_name as string) ?? "—", (s.sales_rep_id as string) ?? null);
      r.vendido += Number(s.venta_bruta ?? 0);
    }
    for (const inv of invoices ?? []) {
      const r = ensure(inv.account_id as string, "—", null);
      r.facturado += Number(inv.total ?? 0);
      r.cobrado += Number(inv.total_paid ?? 0);
      r.pendiente += Number(inv.balance ?? 0);
      r.nFacturas += 1;
    }

    rows = Array.from(agg.values()).map((r) => {
      const { diferencia, estado } = estadoDe(r.vendido, r.facturado, r.nFacturas);
      return { ...r, vendido: Math.round(r.vendido * 100) / 100, facturado: Math.round(r.facturado * 100) / 100, diferencia, estado };
    });
    // Orden: primero las que requieren atención (mayor |diferencia|).
    rows.sort((a, b) => Math.abs(b.diferencia) - Math.abs(a.diferencia));
  }

  const visibleRows = soloDif ? rows.filter((r) => r.estado !== "conciliado") : rows;

  const tot = rows.reduce(
    (s, r) => ({
      vendido: s.vendido + r.vendido,
      facturado: s.facturado + r.facturado,
      cobrado: s.cobrado + r.cobrado,
      pendiente: s.pendiente + r.pendiente,
    }),
    { vendido: 0, facturado: 0, cobrado: 0, pendiente: 0 },
  );
  const totDif = Math.round((tot.vendido - tot.facturado) * 100) / 100;

  // Rollup por vendedor.
  const byRep = new Map<string, { name: string; vendido: number; facturado: number; pendiente: number; cuentas: number; alertas: number }>();
  for (const r of rows) {
    const key = r.repId ?? "sin";
    const e = byRep.get(key) ?? { name: r.repId ? repName.get(r.repId) ?? "—" : "Sin vendedor", vendido: 0, facturado: 0, pendiente: 0, cuentas: 0, alertas: 0 };
    e.vendido += r.vendido;
    e.facturado += r.facturado;
    e.pendiente += r.pendiente;
    e.cuentas += 1;
    if (r.estado !== "conciliado") e.alertas += 1;
    byRep.set(key, e);
  }
  const repRows = Array.from(byRep.values()).sort((a, b) => b.vendido - a.vendido);

  const periodShort = selected?.slice(0, 7) ?? "";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/ventas" className="mb-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" /> Ventas
          </Link>
          <h1 className="font-display text-3xl">Conciliación ventas ↔ cartera</h1>
          <p className="text-sm text-muted-foreground">
            Lo vendido en el mes contra lo facturado en cartera, por cuenta. Empareja por cliente (no por folio).
          </p>
        </div>
      </div>

      {periods.length === 0 ? (
        <EmptyState
          icon={TrendingUp}
          title="Sin ventas cargadas"
          description="Importa el reporte mensual de ventas para poder conciliar contra cartera."
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
                  href={`/ventas/conciliacion?period=${short}${soloDif ? "&solo=dif" : ""}`}
                  className={active
                    ? "rounded-full bg-brand-carmesi px-3 py-1 text-xs font-medium text-white"
                    : "rounded-full bg-muted px-3 py-1 text-xs text-foreground/70 hover:bg-muted/70"}
                >
                  {labelPeriod(p)}
                </Link>
              );
            })}
          </div>

          {/* Tarjetas de totales */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="rounded-md border bg-muted/30 p-4">
              <div className="text-xs uppercase text-muted-foreground">Vendido</div>
              <div className="font-display text-xl">{formatCurrency(tot.vendido)}</div>
            </div>
            <div className="rounded-md border bg-muted/30 p-4">
              <div className="text-xs uppercase text-muted-foreground">Facturado</div>
              <div className="font-display text-xl">{formatCurrency(tot.facturado)}</div>
            </div>
            <div className={`rounded-md border p-4 ${Math.abs(totDif) > Math.max(50, tot.vendido * 0.005) ? "bg-amber-50 text-amber-900" : "bg-muted/30"}`}>
              <div className="text-xs uppercase text-muted-foreground">Diferencia (vend.−fact.)</div>
              <div className="font-display text-xl">{formatCurrency(totDif)}</div>
            </div>
            <div className="rounded-md border bg-emerald-50 p-4 text-emerald-900">
              <div className="text-xs uppercase">Cobrado</div>
              <div className="font-display text-xl">{formatCurrency(tot.cobrado)}</div>
            </div>
            <div className="rounded-md border bg-red-50 p-4 text-red-800">
              <div className="text-xs uppercase">Pendiente de cobro</div>
              <div className="font-display text-xl">{formatCurrency(tot.pendiente)}</div>
            </div>
          </div>

          {/* Caveat de datos */}
          <div className="flex items-start gap-2 rounded-md border bg-amber-50/60 p-3 text-xs text-amber-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              Las facturas importadas desde el reporte de <strong>Antigüedad de Saldos</strong> guardan en
              <em> total</em> el <strong>saldo abierto</strong>, no el total original (y el cobrado sale en 0). Para esas,
              el <em>facturado</em> puede salir subestimado. Las del listado plano o capturadas a mano sí traen el total real.
            </p>
          </div>

          {/* Rollup por vendedor */}
          <Card><CardContent className="p-0">
            <div className="border-b p-4">
              <h2 className="font-display text-lg">Por vendedor — {selected ? labelPeriod(selected) : ""}</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 text-left">Vendedor</th>
                    <th className="px-4 py-2 text-right">Cuentas</th>
                    <th className="px-4 py-2 text-right">Vendido</th>
                    <th className="px-4 py-2 text-right">Facturado</th>
                    <th className="px-4 py-2 text-right">Diferencia</th>
                    <th className="px-4 py-2 text-right">Pendiente</th>
                    <th className="px-4 py-2 text-right">Alertas</th>
                  </tr>
                </thead>
                <tbody>
                  {repRows.map((r, i) => {
                    const dif = Math.round((r.vendido - r.facturado) * 100) / 100;
                    return (
                      <tr key={i} className="border-t">
                        <td className="px-4 py-2 font-medium">{r.name}</td>
                        <td className="px-4 py-2 text-right">{r.cuentas}</td>
                        <td className="px-4 py-2 text-right">{formatCurrency(r.vendido)}</td>
                        <td className="px-4 py-2 text-right">{formatCurrency(r.facturado)}</td>
                        <td className={`px-4 py-2 text-right ${Math.abs(dif) > Math.max(50, r.vendido * 0.005) ? "font-medium text-amber-700" : "text-muted-foreground"}`}>{formatCurrency(dif)}</td>
                        <td className="px-4 py-2 text-right">{formatCurrency(r.pendiente)}</td>
                        <td className="px-4 py-2 text-right">{r.alertas > 0 ? <span className="font-medium text-red-600">{r.alertas}</span> : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t bg-muted/30 font-medium">
                    <td className="px-4 py-2">TOTAL</td>
                    <td className="px-4 py-2 text-right">{rows.length}</td>
                    <td className="px-4 py-2 text-right">{formatCurrency(tot.vendido)}</td>
                    <td className="px-4 py-2 text-right">{formatCurrency(tot.facturado)}</td>
                    <td className="px-4 py-2 text-right">{formatCurrency(totDif)}</td>
                    <td className="px-4 py-2 text-right">{formatCurrency(tot.pendiente)}</td>
                    <td className="px-4 py-2 text-right">{rows.filter((r) => r.estado !== "conciliado").length}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </CardContent></Card>

          {/* Detalle por cuenta */}
          <Card><CardContent className="p-0">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b p-4">
              <h2 className="font-display text-lg">Por cuenta</h2>
              <div className="flex gap-2 text-xs">
                <Link
                  href={`/ventas/conciliacion?period=${periodShort}`}
                  className={!soloDif ? "rounded-full bg-brand-carmesi px-3 py-1 font-medium text-white" : "rounded-full bg-muted px-3 py-1 text-foreground/70 hover:bg-muted/70"}
                >
                  Todas ({rows.length})
                </Link>
                <Link
                  href={`/ventas/conciliacion?period=${periodShort}&solo=dif`}
                  className={soloDif ? "rounded-full bg-brand-carmesi px-3 py-1 font-medium text-white" : "rounded-full bg-muted px-3 py-1 text-foreground/70 hover:bg-muted/70"}
                >
                  Solo diferencias ({rows.filter((r) => r.estado !== "conciliado").length})
                </Link>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 text-left">Cuenta</th>
                    <th className="px-4 py-2 text-right">Vendido</th>
                    <th className="px-4 py-2 text-right">Facturado</th>
                    <th className="px-4 py-2 text-right">Facturas</th>
                    <th className="px-4 py-2 text-right">Diferencia</th>
                    <th className="px-4 py-2 text-right">Pendiente</th>
                    <th className="px-4 py-2 text-left">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((r) => {
                    const meta = ESTADO_META[r.estado];
                    return (
                      <tr key={r.accountId} className="border-t">
                        <td className="px-4 py-2">{r.name}</td>
                        <td className="px-4 py-2 text-right">{formatCurrency(r.vendido)}</td>
                        <td className="px-4 py-2 text-right">{formatCurrency(r.facturado)}</td>
                        <td className="px-4 py-2 text-right text-muted-foreground">{r.nFacturas || "—"}</td>
                        <td className={`px-4 py-2 text-right ${r.estado === "conciliado" ? "text-muted-foreground" : "font-medium"}`}>{formatCurrency(r.diferencia)}</td>
                        <td className="px-4 py-2 text-right">{formatCurrency(r.pendiente)}</td>
                        <td className="px-4 py-2">
                          <span className={`inline-block rounded-full border px-2 py-0.5 text-xs ${meta.cls}`}>{meta.label}</span>
                        </td>
                      </tr>
                    );
                  })}
                  {visibleRows.length === 0 && (
                    <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-muted-foreground">Sin cuentas para mostrar.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent></Card>
        </>
      )}
    </div>
  );
}
