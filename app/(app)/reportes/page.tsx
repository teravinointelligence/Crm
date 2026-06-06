import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRep } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { CategoryBarChart, MonthlyBarChart } from "@/components/reports/Charts";
import { formatCurrency } from "@/lib/utils";
import { IVA_RATE } from "@/lib/pricing";

export const metadata = { title: "Reportes — TERAVINO CRM" };

type Period = "ytd" | "last30" | "last90" | string; // string = year YYYY

type OrderRow = {
  id: string;
  total: number | null;
  subtotal: number | null;
  iva: number | null;
  order_date: string;
  sales_rep_id: string | null;
  account_id: string;
  status: string;
  accounts: { id: string; business_name: string | null; region: string | null } | null;
  sales_reps: { full_name: string | null } | null;
  order_items: Array<{ product_id: string | null; product_name: string; supplier: string | null; quantity: number; line_total: number | null; unit_price: number | null }>;
};

type InvoiceRow = { id: string; account_id: string; due_date: string | null; balance: number | null; status: string };

const CLOSED_STATUSES = ["aceptada", "facturada", "entregada"];

function rangeFor(period: Period): { from: string; to: string; label: string } {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  if (period === "last30") {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return { from: d.toISOString().slice(0, 10), to: today, label: "Últimos 30 días" };
  }
  if (period === "last90") {
    const d = new Date();
    d.setDate(d.getDate() - 90);
    return { from: d.toISOString().slice(0, 10), to: today, label: "Últimos 90 días" };
  }
  const yMatch = /^(\d{4})$/.exec(period);
  if (yMatch) {
    const y = Number(yMatch[1]);
    return { from: `${y}-01-01`, to: `${y}-12-31`, label: `Año ${y}` };
  }
  // ytd
  const y = now.getFullYear();
  return { from: `${y}-01-01`, to: today, label: `Año ${y} (a la fecha)` };
}

const KNOWN_PERIODS: { value: string; label: string }[] = [
  { value: "ytd", label: "Año actual" },
  { value: "last30", label: "30 días" },
  { value: "last90", label: "90 días" },
];

export default async function ReportesPage({
  searchParams,
}: {
  searchParams: { period?: string };
}) {
  const rep = await getCurrentRep();
  if (!rep) redirect("/login");
  if (rep.role !== "admin") redirect("/");

  const supabase = createClient();
  const period: Period = searchParams.period ?? "ytd";
  const range = rangeFor(period);
  const currentYear = new Date().getFullYear();
  const yearOptions = [currentYear - 1, currentYear - 2].map((y) => ({ value: String(y), label: String(y) }));
  const allPeriods = [...KNOWN_PERIODS, ...yearOptions];

  // Twelve-month rolling window for the trend chart
  const trendStart = new Date();
  trendStart.setDate(1);
  trendStart.setMonth(trendStart.getMonth() - 11);
  const trendStartISO = trendStart.toISOString().slice(0, 10);

  const [
    { data: ordersData },
    { data: trendData },
    { data: balanceData },
    { data: invoicesData },
    { data: poData },
    { data: accountsByRegion },
  ] = await Promise.all([
    supabase
      .from("orders")
      .select(
        "id, total, subtotal, iva, order_date, status, sales_rep_id, account_id, accounts:account_id(id, business_name, region), sales_reps:sales_rep_id(full_name), order_items(product_id, product_name, supplier, quantity, line_total, unit_price)",
      )
      .in("status", CLOSED_STATUSES)
      .gte("order_date", range.from)
      .lte("order_date", range.to),
    supabase
      .from("orders")
      .select("id, total, order_date, status")
      .in("status", CLOSED_STATUSES)
      .gte("order_date", trendStartISO),
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

  const orders = ((ordersData ?? []) as unknown) as OrderRow[];
  const invoices = ((invoicesData ?? []) as unknown) as InvoiceRow[];

  const totalFacturado = orders.reduce((s, o) => s + Number(o.total ?? 0), 0);
  const totalSubtotal = orders.reduce((s, o) => s + Number(o.subtotal ?? 0), 0);
  const totalIva = orders.reduce(
    (s, o) => s + Number(o.iva ?? (o.subtotal ? Number(o.subtotal) * IVA_RATE : 0)),
    0,
  );
  const numPedidos = orders.length;
  const ticketPromedio = numPedidos ? totalFacturado / numPedidos : 0;
  const cuentasConCompra = new Set(orders.map((o) => o.account_id)).size;

  const balanceTotals = ((balanceData ?? []) as unknown) as { saldo_pendiente: number | null; saldo_vencido: number | null }[];
  const saldoPendiente = balanceTotals.reduce((s, r) => s + Number(r.saldo_pendiente ?? 0), 0);
  const saldoVencido = balanceTotals.reduce((s, r) => s + Number(r.saldo_vencido ?? 0), 0);

  const enTransito = ((poData ?? []) as unknown as { total: number | null }[]).reduce(
    (s, p) => s + Number(p.total ?? 0),
    0,
  );

  // Por región
  const byRegion = new Map<string, number>();
  for (const o of orders) {
    const r = o.accounts?.region ?? "Sin región";
    byRegion.set(r, (byRegion.get(r) ?? 0) + Number(o.total ?? 0));
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
  type RepAgg = { name: string; total: number; count: number };
  const byRep = new Map<string, RepAgg>();
  for (const o of orders) {
    const key = o.sales_rep_id ?? "sin";
    const name = o.sales_reps?.full_name ?? "Sin vendedor";
    const cur = byRep.get(key) ?? { name, total: 0, count: 0 };
    cur.total += Number(o.total ?? 0);
    cur.count += 1;
    byRep.set(key, cur);
  }
  const repList = [...byRep.values()].sort((a, b) => b.total - a.total);
  const repChartData = repList.map((r) => ({ label: r.name.split(" ")[0], value: r.total }));

  // Top cuentas
  type AccAgg = { id: string; name: string; region: string; total: number; count: number };
  const byAccount = new Map<string, AccAgg>();
  for (const o of orders) {
    if (!o.accounts) continue;
    const cur = byAccount.get(o.account_id) ?? {
      id: o.account_id,
      name: o.accounts.business_name ?? "—",
      region: o.accounts.region ?? "—",
      total: 0,
      count: 0,
    };
    cur.total += Number(o.total ?? 0);
    cur.count += 1;
    byAccount.set(o.account_id, cur);
  }
  const topAccounts = [...byAccount.values()].sort((a, b) => b.total - a.total).slice(0, 10);

  // Top productos
  type ProdAgg = { name: string; supplier: string; qty: number; revenue: number };
  const byProduct = new Map<string, ProdAgg>();
  for (const o of orders) {
    for (const i of o.order_items ?? []) {
      const key = i.product_id ?? `name:${i.product_name}`;
      const cur = byProduct.get(key) ?? { name: i.product_name, supplier: i.supplier ?? "—", qty: 0, revenue: 0 };
      cur.qty += Number(i.quantity ?? 0);
      cur.revenue += Number(i.line_total ?? Number(i.quantity ?? 0) * Number(i.unit_price ?? 0));
      byProduct.set(key, cur);
    }
  }
  const topProductsByRevenue = [...byProduct.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 10);

  // Por proveedor
  const bySupplier = new Map<string, { revenue: number; bottles: number }>();
  for (const p of byProduct.values()) {
    const cur = bySupplier.get(p.supplier) ?? { revenue: 0, bottles: 0 };
    cur.revenue += p.revenue;
    cur.bottles += p.qty;
    bySupplier.set(p.supplier, cur);
  }
  const supplierList = [...bySupplier.entries()]
    .map(([supplier, v]) => ({ supplier, ...v }))
    .sort((a, b) => b.revenue - a.revenue);

  // Tendencia 12 meses
  const months: { key: string; label: string }[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("es-MX", { month: "short" }).replace(".", "");
    months.push({ key, label: label.charAt(0).toUpperCase() + label.slice(1) });
  }
  const trendMap = new Map(months.map((m) => [m.key, 0] as [string, number]));
  for (const t of ((trendData ?? []) as { order_date: string; total: number | null }[])) {
    const key = t.order_date.slice(0, 7);
    if (trendMap.has(key)) trendMap.set(key, (trendMap.get(key) ?? 0) + Number(t.total ?? 0));
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
          <h1 className="font-display text-2xl sm:text-3xl">Reportes</h1>
          <p className="text-sm text-muted-foreground">
            {range.label} · {range.from} → {range.to}
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
        <Kpi label="Facturado" value={formatCurrency(totalFacturado)} subtitle={`Subtotal ${formatCurrency(totalSubtotal)}`} />
        <Kpi label="Pedidos cerrados" value={numPedidos.toString()} subtitle={`Ticket prom. ${formatCurrency(ticketPromedio)}`} />
        <Kpi label="Cuentas con compra" value={cuentasConCompra.toString()} subtitle={`del periodo`} />
        <Kpi label="IVA generado" value={formatCurrency(totalIva)} subtitle="16%" />
        <Kpi label="Saldo pendiente" value={formatCurrency(saldoPendiente)} subtitle="cartera abierta" tone={saldoPendiente > 0 ? "warning" : "default"} />
        <Kpi label="Saldo vencido" value={formatCurrency(saldoVencido)} subtitle="cartera vencida" tone={saldoVencido > 0 ? "danger" : "default"} />
        <Kpi label="En tránsito" value={formatCurrency(enTransito)} subtitle="OCs activas" />
        <Kpi label="Cuentas activas" value={[...activeByRegion.values()].reduce((s, n) => s + n, 0).toString()} subtitle="total CRM" />
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <CategoryBarChart title="Ventas por región" subtitle="Total facturado en el periodo" data={regionData} />
        <CategoryBarChart title="Ventas por vendedor" subtitle="Total facturado en el periodo" data={repChartData} />
      </section>

      <section>
        <MonthlyBarChart title="Tendencia 12 meses" subtitle="Pedidos cerrados (aceptada / facturada / entregada)" data={trendChart} />
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardContent className="p-0">
            <div className="border-b px-4 py-3">
              <h3 className="font-display text-lg">Top 10 cuentas</h3>
              <p className="text-xs text-muted-foreground">Por facturación del periodo</p>
            </div>
            {topAccounts.length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground">Sin datos.</p>
            ) : (
              <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                  <tr><th className="px-4 py-2">Cuenta</th><th className="px-4 py-2">Región</th><th className="px-4 py-2 text-right">Pedidos</th><th className="px-4 py-2 text-right">Total</th></tr>
                </thead>
                <tbody>
                  {topAccounts.map((a) => (
                    <tr key={a.id} className="border-b last:border-b-0">
                      <td className="px-4 py-2"><Link href={`/cuentas/${a.id}`} className="font-medium hover:text-brand-carmesi">{a.name}</Link></td>
                      <td className="px-4 py-2 text-muted-foreground">{a.region}</td>
                      <td className="px-4 py-2 text-right text-muted-foreground">{a.count}</td>
                      <td className="px-4 py-2 text-right font-medium">{formatCurrency(a.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            <div className="border-b px-4 py-3">
              <h3 className="font-display text-lg">Top 10 vinos vendidos</h3>
              <p className="text-xs text-muted-foreground">Por ingresos del periodo</p>
            </div>
            {topProductsByRevenue.length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground">Sin datos.</p>
            ) : (
              <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                  <tr><th className="px-4 py-2">Vino</th><th className="px-4 py-2">Proveedor</th><th className="px-4 py-2 text-right">Botellas</th><th className="px-4 py-2 text-right">Ingresos</th></tr>
                </thead>
                <tbody>
                  {topProductsByRevenue.map((p, i) => (
                    <tr key={i} className="border-b last:border-b-0">
                      <td className="px-4 py-2 font-medium">{p.name}</td>
                      <td className="px-4 py-2 text-muted-foreground">{p.supplier}</td>
                      <td className="px-4 py-2 text-right text-muted-foreground">{p.qty}</td>
                      <td className="px-4 py-2 text-right font-medium">{formatCurrency(p.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardContent className="p-0">
            <div className="border-b px-4 py-3">
              <h3 className="font-display text-lg">Por proveedor</h3>
              <p className="text-xs text-muted-foreground">Ingresos y botellas vendidas en el periodo</p>
            </div>
            {supplierList.length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground">Sin datos.</p>
            ) : (
              <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                  <tr><th className="px-4 py-2">Proveedor</th><th className="px-4 py-2 text-right">Botellas</th><th className="px-4 py-2 text-right">Ingresos</th></tr>
                </thead>
                <tbody>
                  {supplierList.map((s, i) => (
                    <tr key={i} className="border-b last:border-b-0">
                      <td className="px-4 py-2 font-medium">{s.supplier}</td>
                      <td className="px-4 py-2 text-right text-muted-foreground">{s.bottles}</td>
                      <td className="px-4 py-2 text-right font-medium">{formatCurrency(s.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            )}
          </CardContent>
        </Card>

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
              <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                  <tr><th className="px-4 py-2">Vendedor</th><th className="px-4 py-2 text-right">Pedidos</th><th className="px-4 py-2 text-right">Total</th><th className="px-4 py-2 text-right">Ticket prom.</th></tr>
                </thead>
                <tbody>
                  {repList.map((r, i) => (
                    <tr key={i} className="border-b last:border-b-0">
                      <td className="px-4 py-2 font-medium">{r.name}</td>
                      <td className="px-4 py-2 text-right text-muted-foreground">{r.count}</td>
                      <td className="px-4 py-2 text-right font-medium">{formatCurrency(r.total)}</td>
                      <td className="px-4 py-2 text-right text-muted-foreground">{formatCurrency(r.count ? r.total / r.count : 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
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
