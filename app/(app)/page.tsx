import Link from "next/link";
import {
  Building2,
  CalendarCheck2,
  FileText,
  TrendingUp,
  Plus,
  Wallet,
  PackageCheck,
  Banknote,
  Wine,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRep } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ActivityTimeline } from "@/components/activities/ActivityTimeline";
import { ActivityCalendar } from "@/components/dashboard/ActivityCalendar";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { Activity } from "@/types/database";

export const metadata = { title: "Dashboard — TERAVINO CRM" };

export default async function DashboardPage() {
  const supabase = createClient();
  const rep = await getCurrentRep();
  if (!rep) return null;

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const monthStartISO = monthStart.toISOString();
  const sevenDaysOut = new Date();
  sevenDaysOut.setDate(sevenDaysOut.getDate() + 7);
  const todayISO = new Date().toISOString().slice(0, 10);
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  const ninetyDaysAgoISO = ninetyDaysAgo.toISOString().slice(0, 10);

  const isAdmin = rep.role === "admin";

  const [
    accountsActiveRes,
    activitiesMonthRes,
    pipelineRes,
    closedMonthRes,
    upcomingRes,
    topRes,
    balanceRes,
    restockPendingRes,
    supplierDueRes,
    monthlySalesRes,
    topVinosRes,
  ] = await Promise.all([
    supabase
      .from("accounts")
      .select("id", { count: "exact", head: true })
      .eq("status", "activo"),
    supabase
      .from("activities")
      .select("id", { count: "exact", head: true })
      .gte("activity_date", monthStartISO),
    supabase
      .from("orders")
      .select("total")
      .eq("order_type", "cotizacion")
      .in("status", ["borrador", "enviada"]),
    supabase
      .from("orders")
      .select("total")
      .in("status", ["aceptada", "facturada", "entregada"])
      .gte("order_date", monthStartISO.slice(0, 10)),
    supabase
      .from("activities")
      .select("*, accounts:account_id(business_name)")
      .gte("next_step_date", todayISO)
      .lte("next_step_date", sevenDaysOut.toISOString().slice(0, 10))
      .order("next_step_date", { ascending: true })
      .limit(10),
    supabase
      .from("orders")
      .select(
        "account_id, total, accounts:account_id(business_name, region)",
      )
      .in("status", ["aceptada", "facturada", "entregada"])
      .gte("order_date", monthStartISO.slice(0, 10)),
    supabase.from("v_account_balance").select("saldo_pendiente, saldo_vencido"),
    supabase
      .from("restock_requests")
      .select("id, request_number, region_destino, created_at, sales_reps:sales_rep_id(full_name)", { count: "exact" })
      .eq("status", "enviada")
      .order("created_at", { ascending: true })
      .limit(8),
    isAdmin
      ? supabase
          .from("purchase_orders")
          .select("id, po_number, supplier, supplier_invoice_due_date, balance")
          .not("supplier_invoice_number", "is", null)
          .neq("status", "cancelada")
          .gt("balance", 0)
          .lte("supplier_invoice_due_date", sevenDaysOut.toISOString().slice(0, 10))
          .order("supplier_invoice_due_date", { ascending: true })
          .limit(8)
      : Promise.resolve({ data: [] as never[] }),
    // Ventas mensuales cargadas (CONTPAQ) — para top clientes del último periodo.
    supabase
      .from("monthly_sales")
      .select("account_id, client_name, period, venta_bruta")
      .order("period", { ascending: false })
      .limit(1000),
    // Top vinos desde pedidos cerrados del CRM (la carga de ventas no trae producto).
    supabase
      .from("orders")
      .select("status, order_date, order_items(product_name, supplier, line_total, quantity)")
      .in("status", ["aceptada", "facturada", "entregada"])
      .gte("order_date", ninetyDaysAgoISO),
  ]);

  // Vendedores para el selector del calendario (solo admin lo usa).
  const repsForCalendar = isAdmin
    ? (((await supabase.from("sales_reps").select("id, full_name").eq("active", true).order("full_name")).data ?? []) as { id: string; full_name: string }[])
    : [];

  const pipelineTotal = (pipelineRes.data ?? []).reduce(
    (sum, o) => sum + Number(o.total ?? 0),
    0,
  );
  const closedTotal = (closedMonthRes.data ?? []).reduce(
    (sum, o) => sum + Number(o.total ?? 0),
    0,
  );

  const topMap = new Map<string, { name: string; region: string | null; total: number }>();
  for (const o of (topRes.data ?? []) as unknown as Array<{
    account_id: string;
    total: number | null;
    accounts: { business_name: string | null; region: string | null } | null;
  }>) {
    if (!o.account_id) continue;
    const entry = topMap.get(o.account_id) ?? {
      name: o.accounts?.business_name ?? "—",
      region: o.accounts?.region ?? null,
      total: 0,
    };
    entry.total += Number(o.total ?? 0);
    topMap.set(o.account_id, entry);
  }
  const topAccounts = Array.from(topMap.entries())
    .map(([id, v]) => ({ id, ...v }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  // Top clientes desde ventas mensuales cargadas (último periodo disponible).
  const ventasRows = (monthlySalesRes.data ?? []) as Array<{
    account_id: string; client_name: string | null; period: string; venta_bruta: number | null;
  }>;
  const ventasPeriod = ventasRows[0]?.period ?? null; // ya viene ordenado desc
  const topClientesMap = new Map<string, { name: string; total: number }>();
  for (const v of ventasRows) {
    if (v.period !== ventasPeriod) continue;
    const e = topClientesMap.get(v.account_id) ?? { name: v.client_name ?? "—", total: 0 };
    e.total += Number(v.venta_bruta ?? 0);
    topClientesMap.set(v.account_id, e);
  }
  const topClientes = Array.from(topClientesMap.entries())
    .map(([id, v]) => ({ id, ...v }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);
  const ventasPeriodLabel = ventasPeriod
    ? (() => {
        const meses = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
        const [y, m] = ventasPeriod.split("-").map(Number);
        return `${meses[m - 1]} ${y}`;
      })()
    : null;

  // Top vinos: preferimos ventas reales (monthly_sales_items del último periodo).
  // Si no hay detalle de producto cargado, caemos a pedidos cerrados del CRM.
  let topVinos: { name: string; supplier: string; revenue: number; qty: number }[] = [];
  let topVinosSource: "ventas" | "pedidos" = "pedidos";
  if (ventasPeriod) {
    const { data: prodItems } = await supabase
      .from("monthly_sales_items")
      .select("producto_nombre, codigo, cantidad, total, monthly_sales!inner(period)")
      .eq("monthly_sales.period", ventasPeriod)
      .limit(5000);
    if (prodItems && prodItems.length) {
      const pm = new Map<string, { name: string; supplier: string; revenue: number; qty: number }>();
      for (const it of prodItems as unknown as Array<{ producto_nombre: string; codigo: string | null; cantidad: number | null; total: number | null }>) {
        const key = it.producto_nombre;
        const e = pm.get(key) ?? { name: it.producto_nombre, supplier: "—", revenue: 0, qty: 0 };
        e.revenue += Number(it.total ?? 0);
        e.qty += Number(it.cantidad ?? 0);
        pm.set(key, e);
      }
      topVinos = Array.from(pm.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 5);
      topVinosSource = "ventas";
    }
  }
  if (!topVinos.length) {
    const vinoMap = new Map<string, { name: string; supplier: string; revenue: number; qty: number }>();
    for (const o of (topVinosRes.data ?? []) as unknown as Array<{
      order_items: Array<{ product_name: string; supplier: string | null; line_total: number | null; quantity: number | null }> | null;
    }>) {
      for (const it of o.order_items ?? []) {
        const key = `${it.product_name}__${it.supplier ?? ""}`;
        const e = vinoMap.get(key) ?? { name: it.product_name, supplier: it.supplier ?? "—", revenue: 0, qty: 0 };
        e.revenue += Number(it.line_total ?? 0);
        e.qty += Number(it.quantity ?? 0);
        vinoMap.set(key, e);
      }
    }
    topVinos = Array.from(vinoMap.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 5);
    topVinosSource = "pedidos";
  }

  const carteraPendiente = (balanceRes.data ?? []).reduce((s, b) => s + Number(b.saldo_pendiente ?? 0), 0);
  const carteraVencida = (balanceRes.data ?? []).reduce((s, b) => s + Number(b.saldo_vencido ?? 0), 0);
  const restockPending = (restockPendingRes.data ?? []) as unknown as Array<{
    id: string; request_number: string; region_destino: string | null; created_at: string | null; sales_reps: { full_name: string | null } | null;
  }>;
  const supplierDue = (supplierDueRes.data ?? []) as unknown as Array<{
    id: string; po_number: string; supplier: string; supplier_invoice_due_date: string | null; balance: number | null;
  }>;
  const supplierDueTotal = supplierDue.reduce((s, p) => s + Number(p.balance ?? 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl">
            Hola, {rep.full_name.split(" ")[0]}
          </h1>
          <p className="text-sm text-muted-foreground">
            {rep.role === "admin"
              ? "Vista de dirección · todas las regiones"
              : `Tu cartera en ${rep.primary_region ?? "tu región"}`}
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild>
            <Link href="/actividades/nueva">
              <Plus className="mr-1 h-4 w-4" /> Visita
            </Link>
          </Button>
          <Button asChild variant="accent">
            <Link href="/pedidos/nuevo">
              <Plus className="mr-1 h-4 w-4" /> Cotización
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icon={Building2}
          label="Cuentas activas"
          value={accountsActiveRes.count?.toLocaleString("es-MX") ?? "0"}
        />
        <KpiCard
          icon={CalendarCheck2}
          label="Actividades del mes"
          value={activitiesMonthRes.count?.toLocaleString("es-MX") ?? "0"}
        />
        <KpiCard
          icon={FileText}
          label="Pipeline en cotizaciones"
          value={formatCurrency(pipelineTotal)}
        />
        <KpiCard
          icon={TrendingUp}
          label="Cerrado este mes"
          value={formatCurrency(closedTotal)}
          accent
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icon={Wallet}
          label="Cartera por cobrar"
          value={formatCurrency(carteraPendiente)}
          href="/cartera"
        />
        <KpiCard
          icon={Wallet}
          label="Cartera vencida"
          value={formatCurrency(carteraVencida)}
          danger={carteraVencida > 0}
          href="/cartera"
        />
        <KpiCard
          icon={PackageCheck}
          label={isAdmin ? "Restocks por revisar" : "Mis restocks enviados"}
          value={(restockPendingRes.count ?? restockPending.length).toLocaleString("es-MX")}
          href="/restock"
        />
        {isAdmin && (
          <KpiCard
            icon={Banknote}
            label="Pagos a proveedores (7 días)"
            value={formatCurrency(supplierDueTotal)}
            danger={supplierDueTotal > 0}
            href="/cuentas-pagar"
          />
        )}
      </div>

      {(isAdmin && (restockPending.length > 0 || supplierDue.length > 0)) && (
        <div className="grid gap-6 lg:grid-cols-2">
          {restockPending.length > 0 && (
            <div className="space-y-3">
              <h2 className="font-display text-xl">Restocks pendientes de revisar</h2>
              <Card><CardContent className="space-y-2 p-4">
                {restockPending.map((r) => (
                  <Link key={r.id} href={`/restock/${r.id}`} className="flex items-center justify-between gap-2 rounded-md border bg-card p-3 hover:border-brand-carmesi">
                    <div><div className="font-medium">{r.request_number}</div><div className="text-xs text-muted-foreground">{r.sales_reps?.full_name ?? "—"} · {r.region_destino ?? "sin región"} · {formatDate(r.created_at)}</div></div>
                    <Badge variant="warning">Revisar</Badge>
                  </Link>
                ))}
              </CardContent></Card>
            </div>
          )}
          {supplierDue.length > 0 && (
            <div className="space-y-3">
              <h2 className="font-display text-xl">Pagos a proveedores próximos a vencer</h2>
              <Card><CardContent className="space-y-2 p-4">
                {supplierDue.map((p) => (
                  <Link key={p.id} href={`/transito/${p.id}`} className="flex items-center justify-between gap-2 rounded-md border bg-card p-3 hover:border-brand-carmesi">
                    <div><div className="font-medium">{p.supplier} · {p.po_number}</div><div className="text-xs text-muted-foreground">vence {p.supplier_invoice_due_date ? formatDate(p.supplier_invoice_due_date) : "—"}</div></div>
                    <span className="font-display text-brand-carmesi">{formatCurrency(p.balance)}</span>
                  </Link>
                ))}
              </CardContent></Card>
            </div>
          )}
        </div>
      )}

      <div className="space-y-3">
        <h2 className="font-display text-xl">Calendario de actividades</h2>
        <ActivityCalendar isAdmin={isAdmin} reps={repsForCalendar} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          <h2 className="font-display text-xl">Próximos pasos (7 días)</h2>
          {upcomingRes.data?.length ? (
            <ActivityTimeline
              activities={(upcomingRes.data ?? []) as Activity[]}
              showAccount
            />
          ) : (
            <EmptyState
              icon={CalendarCheck2}
              title="Sin pendientes próximos"
              description="Cuando registres actividades con un siguiente paso aparecerán aquí."
            />
          )}
        </div>

        <div className="space-y-3">
          <h2 className="font-display text-xl">
            Top clientes{ventasPeriodLabel ? <span className="text-sm font-normal text-muted-foreground"> · {ventasPeriodLabel}</span> : ""}
          </h2>
          {topClientes.length ? (
            <Card>
              <CardContent className="space-y-3 p-4">
                {topClientes.map((a, idx) => (
                  <Link
                    key={a.id}
                    href={`/cuentas/${a.id}`}
                    className="flex items-center justify-between gap-2 rounded-md border bg-card p-3 hover:border-brand-carmesi"
                  >
                    <div>
                      <div className="text-xs text-muted-foreground">#{idx + 1}</div>
                      <div className="font-medium">{a.name}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-display text-brand-carmesi">{formatCurrency(a.total)}</div>
                    </div>
                  </Link>
                ))}
              </CardContent>
            </Card>
          ) : (
            <EmptyState
              icon={TrendingUp}
              title="Sin ventas cargadas"
              description="Importa el reporte mensual de ventas en /ventas para ver el top de clientes."
            />
          )}
        </div>
      </div>

      <div className="space-y-3">
        <h2 className="font-display text-xl">
          Top vinos <span className="text-sm font-normal text-muted-foreground">· {topVinosSource === "ventas" ? `ventas ${ventasPeriodLabel}` : "pedidos cerrados (90 días)"}</span>
        </h2>
        {topVinos.length ? (
          <Card>
            <CardContent className="space-y-2 p-4">
              {topVinos.map((v, idx) => (
                <div
                  key={`${v.name}-${idx}`}
                  className="flex items-center justify-between gap-2 rounded-md border bg-card p-3"
                >
                  <div>
                    <div className="text-xs text-muted-foreground">#{idx + 1}</div>
                    <div className="font-medium">{v.name}</div>
                    <div className="text-xs text-muted-foreground">{v.supplier} · {v.qty} botellas</div>
                  </div>
                  <div className="text-right font-display text-brand-carmesi">{formatCurrency(v.revenue)}</div>
                </div>
              ))}
            </CardContent>
          </Card>
        ) : (
          <EmptyState
            icon={Wine}
            title="Sin vinos en pedidos recientes"
            description="El top de vinos sale de cotizaciones/pedidos cerrados del CRM. La carga de ventas mensuales no incluye desglose por producto."
          />
        )}
      </div>
    </div>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  accent,
  danger,
  href,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  accent?: boolean;
  danger?: boolean;
  href?: string;
}) {
  const inner = (
    <Card className={href ? "transition hover:border-brand-carmesi" : undefined}>
      <CardContent className="flex items-start justify-between gap-3 p-4">
        <div className="space-y-1">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            {label}
          </div>
          <div
            className={`font-display text-2xl ${
              danger ? "text-red-600" : accent ? "text-brand-carmesi" : ""
            }`}
          >
            {value}
          </div>
        </div>
        <div className="rounded-full bg-accent/20 p-2 text-brand-carmesi">
          <Icon className="h-4 w-4" />
        </div>
      </CardContent>
    </Card>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}
