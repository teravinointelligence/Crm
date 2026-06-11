// Reportes: KPIs y gráficas sobre las MISMAS ventas que el módulo Ventas
// (monthly_sales, importación mensual CONTPAQ). Los pedidos del CRM (orders)
// son cotizaciones/levantamientos y NO son la fuente de facturación real, por
// eso este tablero no los usa para ingresos. Cartera (invoices) y compras
// (purchase_orders) conservan sus fuentes propias.

import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRep } from "@/lib/auth";
import { canSeeFinance } from "@/lib/modules";
import { Card, CardContent } from "@/components/ui/card";
import { CategoryBarChart, MonthlyBarChart } from "@/components/reports/Charts";
import { formatCurrency } from "@/lib/utils";

export const metadata = { title: "Reportes — TERAVINO CRM" };

type Period = "ytd" | "m3" | "m6" | string; // string = año YYYY

// Fila de monthly_sales con sus joins (cuenta y vendedor).
type SaleRow = {
  id: string;
  account_id: string;
  sales_rep_id: string | null;
  period: string;
  venta_bruta: number | null;
  neto_desc: number | null;
  descuento: number | null;
  accounts: { id: string; business_name: string | null; region: string | null } | null;
  sales_reps: { full_name: string | null } | null;
};

type ProductRow = {
  period: string;
  codigo: string | null;
  producto_nombre: string;
  cantidad: number | null;
  total: number | null;
};

type InvoiceRow = { id: string; account_id: string; due_date: string | null; balance: number | null; status: string };

const MESES_CORTOS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

function monthISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function labelMonth(periodISO: string): string {
  const [y, m] = periodISO.split("-").map(Number);
  return `${MESES_CORTOS[m - 1]} ${y}`;
}

// Las ventas viven a nivel mes (period = primer día del mes), así que el
// filtro de periodo se expresa en meses completos, no en días sueltos.
function rangeFor(period: Period): { fromMonth: string; toMonth: string; label: string } {
  const now = new Date();
  const thisMonth = monthISO(now);
  if (period === "m3" || period === "m6") {
    const back = period === "m3" ? 2 : 5;
    const d = new Date(now.getFullYear(), now.getMonth() - back, 1);
    return { fromMonth: monthISO(d), toMonth: thisMonth, label: `Últimos ${back + 1} meses` };
  }
  const yMatch = /^(\d{4})$/.exec(period);
  if (yMatch) {
    const y = Number(yMatch[1]);
    return { fromMonth: `${y}-01-01`, toMonth: `${y}-12-01`, label: `Año ${y}` };
  }
  // ytd (y cualquier valor desconocido)
  const y = now.getFullYear();
  return { fromMonth: `${y}-01-01`, toMonth: thisMonth, label: `Año ${y} (a la fecha)` };
}

const KNOWN_PERIODS: { value: string; label: string }[] = [
  { value: "ytd", label: "Año actual" },
  { value: "m3", label: "Últimos 3 meses" },
  { value: "m6", label: "Últimos 6 meses" },
];

export default async function ReportesPage({
  searchParams,
}: {
  searchParams: { period?: string };
}) {
  const rep = await getCurrentRep();
  if (!rep) redirect("/login");
  if (!canSeeFinance(rep.role)) redirect("/");

  const supabase = createClient();
  const period: Period = searchParams.period ?? "ytd";
  const range = rangeFor(period);
  const currentYear = new Date().getFullYear();
  const yearOptions = [currentYear - 1, currentYear - 2].map((y) => ({ value: String(y), label: String(y) }));
  const allPeriods = [...KNOWN_PERIODS, ...yearOptions];

  // Ventana rodante de 12 meses para la tendencia
  const now = new Date();
  const trendStartMonth = monthISO(new Date(now.getFullYear(), now.getMonth() - 11, 1));

  const [
    { data: salesData },
    { data: trendData },
    { data: productData },
    { data: balanceData },
    { data: invoicesData },
    { data: poData },
    { data: accountsByRegion },
  ] = await Promise.all([
    supabase
      .from("monthly_sales")
      .select(
        "id, account_id, sales_rep_id, period, venta_bruta, neto_desc, descuento, accounts:account_id(id, business_name, region), sales_reps:sales_rep_id(full_name)",
      )
      .gte("period", range.fromMonth)
      .lte("period", range.toMonth)
      .limit(10000),
    supabase
      .from("v_monthly_sales_by_rep")
      .select("period, venta_bruta")
      .gte("period", trendStartMonth)
      .limit(2000),
    supabase
      .from("v_monthly_product_sales")
      .select("period, codigo, producto_nombre, cantidad, total")
      .gte("period", range.fromMonth)
      .lte("period", range.toMonth)
      .limit(20000),
    supabase.from("v_account_balance").select("saldo_pendiente, saldo_vencido"),
    supabase
      .from("invoices")
      .select("id, account_id, due_date, balance, status")
      .neq("status", "cancelada")
      .gt("balance", 0),
    supabase
      .from("purchase_orders")
      .select("supplier, total, status")
      .in("status", ["confirmada", "facturada", "en_transito", "recibida_parcial"]),
    supabase.from("accounts").select("region, status").eq("status", "activo"),
  ]);

  const sales = ((salesData ?? []) as unknown) as SaleRow[];
  const productRows = ((productData ?? []) as unknown) as ProductRow[];
  const invoices = ((invoicesData ?? []) as unknown) as InvoiceRow[];

  // KPIs de ventas: mismos números que el módulo Ventas para el mismo periodo.
  const totalFacturado = sales.reduce((s, v) => s + Number(v.venta_bruta ?? 0), 0);
  const baseComision = sales.reduce((s, v) => s + Number(v.neto_desc ?? 0), 0);
  const impuestos = totalFacturado - baseComision; // IVA+IEPS incluidos en la venta bruta
  const descuentos = sales.reduce((s, v) => s + Number(v.descuento ?? 0), 0);
  const cuentasConCompra = new Set(sales.map((v) => v.account_id)).size;
  const ventaPromedio = cuentasConCompra ? totalFacturado / cuentasConCompra : 0;

  const balanceTotals = ((balanceData ?? []) as unknown) as { saldo_pendiente: number | null; saldo_vencido: number | null }[];
  const saldoPendiente = balanceTotals.reduce((s, r) => s + Number(r.saldo_pendiente ?? 0), 0);
  const saldoVencido = balanceTotals.reduce((s, r) => s + Number(r.saldo_vencido ?? 0), 0);

  const enTransito = ((poData ?? []) as unknown as { total: number | null }[]).reduce(
    (s, p) => s + Number(p.total ?? 0),
    0,
  );

  // Por región
  const byRegion = new Map<string, number>();
  for (const v of sales) {
    const r = v.accounts?.region ?? "Sin región";
    byRegion.set(r, (byRegion.get(r) ?? 0) + Number(v.venta_bruta ?? 0));
  }
  const regionData = [...byRegion.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([label, value]) => ({ label, value }));

  // Cuentas activas por región (para densidad)
  const activeByRegion = new Map<string, number>();
  for (const a of ((accountsByRegion ?? []) as { region: string | null }[])) {
    const r = a.region ?? "Sin región";
    activeByRegion.set(r, (activeByRegion.get(r) ?? 0) + 1);
  }

  // Por vendedor
  type RepAgg = { name: string; total: number; comision: number; clientes: Set<string> };
  const byRep = new Map<string, RepAgg>();
  for (const v of sales) {
    const key = v.sales_rep_id ?? "sin";
    const name = v.sales_reps?.full_name ?? "Sin vendedor";
    const cur = byRep.get(key) ?? { name, total: 0, comision: 0, clientes: new Set<string>() };
    cur.total += Number(v.venta_bruta ?? 0);
    cur.comision += Number(v.neto_desc ?? 0);
    cur.clientes.add(v.account_id);
    byRep.set(key, cur);
  }
  const repList = [...byRep.values()].sort((a, b) => b.total - a.total);
  const repChartData = repList.map((r) => ({ label: r.name.split(" ")[0], value: r.total }));

  // Top cuentas
  type AccAgg = { id: string; name: string; region: string; total: number; meses: number };
  const byAccount = new Map<string, AccAgg>();
  for (const v of sales) {
    const cur = byAccount.get(v.account_id) ?? {
      id: v.account_id,
      name: v.accounts?.business_name ?? "—",
      region: v.accounts?.region ?? "—",
      total: 0,
      meses: 0,
    };
    cur.total += Number(v.venta_bruta ?? 0);
    cur.meses += 1; // una fila = un mes con venta de esa cuenta
    byAccount.set(v.account_id, cur);
  }
  const topAccounts = [...byAccount.values()].sort((a, b) => b.total - a.total).slice(0, 10);

  // Top productos (detalle CONTPAQ; sin mapeo confiable a proveedor del catálogo)
  type ProdAgg = { name: string; qty: number; revenue: number };
  const byProduct = new Map<string, ProdAgg>();
  for (const p of productRows) {
    const key = p.codigo ?? `name:${p.producto_nombre}`;
    const cur = byProduct.get(key) ?? { name: p.producto_nombre, qty: 0, revenue: 0 };
    cur.qty += Number(p.cantidad ?? 0);
    cur.revenue += Number(p.total ?? 0);
    byProduct.set(key, cur);
  }
  const topProductsByRevenue = [...byProduct.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 10);

  // Tendencia 12 meses
  const months: { key: string; label: string }[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("es-MX", { month: "short" }).replace(".", "");
    months.push({ key, label: label.charAt(0).toUpperCase() + label.slice(1) });
  }
  const trendMap = new Map(months.map((m) => [m.key, 0] as [string, number]));
  for (const t of ((trendData ?? []) as { period: string; venta_bruta: number | null }[])) {
    const key = t.period.slice(0, 7);
    if (trendMap.has(key)) trendMap.set(key, (trendMap.get(key) ?? 0) + Number(t.venta_bruta ?? 0));
  }
  const trendChart = months.map((m) => ({ label: m.label, value: trendMap.get(m.key) ?? 0 }));

  // Aging buckets
  const today = new Date();
  const buckets = [
    { label: "Por vencer", min: -Infinity, max: 0 },
    { label: "1–30 d", min: 1, max: 30 },
    { label: "31–60 d", min: 31, max: 60 },
    { label: "61–90 d", min: 61, max: 90 },
    { label: "+90 d", min: 91, max: Infinity },
  ];
  const bucketTotals = buckets.map((b) => ({ label: b.label, value: 0 }));
  for (const inv of invoices) {
    const due = inv.due_date ? new Date(inv.due_date) : null;
    let daysOver = 0;
    if (!due) daysOver = 0;
    else daysOver = Math.floor((today.getTime() - due.getTime()) / 86_400_000);
    const idx = buckets.findIndex((b) => daysOver >= b.min && daysOver <= b.max);
    if (idx >= 0) bucketTotals[idx].value += Number(inv.balance ?? 0);
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl">Reportes</h1>
          <p className="text-sm text-muted-foreground">
            {range.label} · {labelMonth(range.fromMonth)} → {labelMonth(range.toMonth)} · Fuente: ventas mensuales (CONTPAQ)
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5 rounded-lg border bg-card p-1">
          {allPeriods.map((p) => {
            const active = period === p.value;
            return (
              <Link
                key={p.value}
                href={`/reportes?period=${p.value}`}
                className={`rounded-md px-3 py-1.5 text-sm transition-colors ${active ? "bg-brand-carmesi text-white" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
              >
                {p.label}
              </Link>
            );
          })}
        </div>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Facturado" value={formatCurrency(totalFacturado)} subtitle={`Base comisión ${formatCurrency(baseComision)}`} />
        <Kpi label="Cuentas con compra" value={cuentasConCompra.toString()} subtitle={`venta prom. ${formatCurrency(ventaPromedio)}`} />
        <Kpi label="Impuestos (IVA/IEPS)" value={formatCurrency(impuestos)} subtitle="incluidos en facturado" />
        <Kpi label="Descuentos" value={formatCurrency(descuentos)} subtitle="otorgados en el periodo" />
        <Kpi label="Saldo pendiente" value={formatCurrency(saldoPendiente)} subtitle="cartera abierta" tone={saldoPendiente > 0 ? "warning" : "default"} />
        <Kpi label="Saldo vencido" value={formatCurrency(saldoVencido)} subtitle="cartera vencida" tone={saldoVencido > 0 ? "danger" : "default"} />
        <Kpi label="En tránsito" value={formatCurrency(enTransito)} subtitle="OCs activas" />
        <Kpi label="Cuentas activas" value={[...activeByRegion.values()].reduce((s, n) => s + n, 0).toString()} subtitle="total CRM" />
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <CategoryBarChart title="Ventas por región" subtitle="Venta bruta del periodo" data={regionData} />
        <CategoryBarChart title="Ventas por vendedor" subtitle="Venta bruta del periodo" data={repChartData} />
      </section>

      <section>
        <MonthlyBarChart title="Tendencia 12 meses" subtitle="Venta bruta mensual (importación CONTPAQ)" data={trendChart} />
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardContent className="p-0">
            <div className="border-b px-4 py-3">
              <h3 className="font-display text-lg">Top 10 cuentas</h3>
              <p className="text-xs text-muted-foreground">Por venta bruta del periodo</p>
            </div>
            {topAccounts.length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground">Sin datos.</p>
            ) : (
              <table className="min-w-full text-sm">
                <thead className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                  <tr><th className="px-4 py-2">Cuenta</th><th className="px-4 py-2">Región</th><th className="px-4 py-2 text-right">Meses</th><th className="px-4 py-2 text-right">Total</th></tr>
                </thead>
                <tbody>
                  {topAccounts.map((a) => (
                    <tr key={a.id} className="border-b last:border-b-0">
                      <td className="px-4 py-2"><Link href={`/cuentas/${a.id}`} className="font-medium hover:text-brand-carmesi">{a.name}</Link></td>
                      <td className="px-4 py-2 text-muted-foreground">{a.region}</td>
                      <td className="px-4 py-2 text-right text-muted-foreground">{a.meses}</td>
                      <td className="px-4 py-2 text-right font-medium">{formatCurrency(a.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            <div className="border-b px-4 py-3">
              <h3 className="font-display text-lg">Top 10 productos vendidos</h3>
              <p className="text-xs text-muted-foreground">Por ingresos del periodo (detalle CONTPAQ)</p>
            </div>
            {topProductsByRevenue.length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground">Sin datos.</p>
            ) : (
              <table className="min-w-full text-sm">
                <thead className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                  <tr><th className="px-4 py-2">Producto</th><th className="px-4 py-2 text-right">Cantidad</th><th className="px-4 py-2 text-right">Ingresos</th></tr>
                </thead>
                <tbody>
                  {topProductsByRevenue.map((p, i) => (
                    <tr key={i} className="border-b last:border-b-0">
                      <td className="px-4 py-2 font-medium">{p.name}</td>
                      <td className="px-4 py-2 text-right text-muted-foreground">{Math.round(p.qty)}</td>
                      <td className="px-4 py-2 text-right font-medium">{formatCurrency(p.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </section>

      <section>
        <CategoryBarChart
          title="Cartera por antigüedad"
          subtitle="Saldo abierto por días vencidos"
          data={bucketTotals}
          color="#A91E3A"
          altColor="#c9a96e"
        />
      </section>

      <section>
        <Card>
          <CardContent className="p-0">
            <div className="border-b px-4 py-3">
              <h3 className="font-display text-lg">Vendedores</h3>
              <p className="text-xs text-muted-foreground">Detalle por vendedor en el periodo</p>
            </div>
            {repList.length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground">Sin datos.</p>
            ) : (
              <table className="min-w-full text-sm">
                <thead className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                  <tr><th className="px-4 py-2">Vendedor</th><th className="px-4 py-2 text-right">Clientes</th><th className="px-4 py-2 text-right">Venta bruta</th><th className="px-4 py-2 text-right">% del total</th><th className="px-4 py-2 text-right">Base comisión</th></tr>
                </thead>
                <tbody>
                  {repList.map((r, i) => (
                    <tr key={i} className="border-b last:border-b-0">
                      <td className="px-4 py-2 font-medium">{r.name}</td>
                      <td className="px-4 py-2 text-right text-muted-foreground">{r.clientes.size}</td>
                      <td className="px-4 py-2 text-right font-medium">{formatCurrency(r.total)}</td>
                      <td className="px-4 py-2 text-right text-muted-foreground">
                        {totalFacturado > 0 ? `${((r.total / totalFacturado) * 100).toFixed(1)}%` : "—"}
                      </td>
                      <td className="px-4 py-2 text-right text-muted-foreground">{formatCurrency(r.comision)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function Kpi({
  label, value, subtitle, tone = "default",
}: { label: string; value: string; subtitle?: string; tone?: "default" | "warning" | "danger" }) {
  const toneClass = tone === "danger" ? "text-red-700" : tone === "warning" ? "text-amber-700" : "text-brand-carmesi";
  return (
    <Card>
      <CardContent className="space-y-1 p-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className={`font-display text-2xl ${toneClass}`}>{value}</p>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </CardContent>
    </Card>
  );
}
