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
  AlarmClock,
  Cake,
  MessageCircle,
  Phone,
  FlaskConical,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRep } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ActivityTimeline } from "@/components/activities/ActivityTimeline";
import { ActivityCalendar } from "@/components/dashboard/ActivityCalendar";
import { formatCurrency, formatDate, formatBirthday } from "@/lib/utils";
import { OnlinePill } from "@/components/equipo/OnlinePill";
import { staleUrgency } from "@/lib/colors";
import type { Activity, UpcomingBirthday } from "@/types/database";

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

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
  const staleDate = new Date();
  staleDate.setDate(staleDate.getDate() - 30);
  staleDate.setHours(0, 0, 0, 0);
  const staleISO = staleDate.toISOString();

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
    samplePendingRes,
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
      .eq("next_step_done", false)
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
    // Muestras esperando aprobación del admin (solicitudes enviadas).
    isAdmin
      ? supabase
          .from("sample_requests")
          .select(
            "id, request_number, created_at, account_id, sales_reps:sales_rep_id(full_name), accounts:account_id(business_name)",
            { count: "exact" },
          )
          .eq("status", "enviada")
          .order("created_at", { ascending: true })
          .limit(8)
      : Promise.resolve({ data: [] as never[], count: 0 }),
  ]);

  // Vendedores para el selector del calendario (solo admin lo usa).
  const repsForCalendar = isAdmin
    ? (((await supabase.from("sales_reps").select("id, full_name").eq("active", true).order("full_name")).data ?? []) as { id: string; full_name: string }[])
    : [];

  // Cuentas sin actividad reciente (>30 días) para el recordatorio "Visitar pronto".
  const staleRes = await supabase
    .from("v_account_last_activity")
    .select(
      "account_id, business_name, region, status, assigned_rep_id, last_activity_date",
    )
    .in("status", ["prospecto", "activo"])
    .or(`last_activity_date.is.null,last_activity_date.lt.${staleISO}`)
    .order("last_activity_date", { ascending: true, nullsFirst: true })
    .limit(12);
  type StaleRow = {
    account_id: string;
    business_name: string | null;
    region: string | null;
    status: string | null;
    assigned_rep_id: string | null;
    last_activity_date: string | null;
  };
  const stale = (staleRes.data ?? []) as unknown as StaleRow[];
  // Contactos registrados por cuenta, para que el vendedor sepa si ya tiene
  // con quién hablar (el badge solo refleja actividad, no contactos).
  const staleContactCounts: Record<string, number> = {};
  if (stale.length) {
    const { data: staleContacts } = await supabase
      .from("contacts")
      .select("account_id")
      .in("account_id", stale.map((s) => s.account_id));
    for (const c of (staleContacts ?? []) as { account_id: string }[]) {
      staleContactCounts[c.account_id] = (staleContactCounts[c.account_id] ?? 0) + 1;
    }
  }
  const repFirst: Record<string, string> = Object.fromEntries(
    repsForCalendar.map((r) => [r.id, r.full_name.split(" ")[0]]),
  );

  // Próximos cumpleaños de contactos (siguientes 30 días) — para mandarles un detalle.
  const birthdaysRes = await supabase
    .from("v_upcoming_birthdays")
    .select("contact_id, account_id, full_name, role, phone, whatsapp, business_name, region, birthday, next_birthday, days_until")
    .lte("days_until", 30)
    .order("days_until", { ascending: true })
    .limit(12);
  const birthdays = (birthdaysRes.data ?? []) as unknown as UpcomingBirthday[];

  // Conteo inicial de "en línea" (activos en los últimos 5 min) para el header.
  // Mínimo 1: quien está viendo el dashboard está en línea aunque su heartbeat
  // (touch_presence) aún no haya aterrizado — evita el brinco "0 → 1 en línea".
  const presenceRes = await supabase
    .from("sales_reps")
    .select("last_seen_at")
    .eq("active", true);
  const onlineNow = Math.max(
    1,
    (presenceRes.data ?? []).filter(
      (r) => r.last_seen_at && Date.now() - new Date(r.last_seen_at).getTime() < 5 * 60_000,
    ).length,
  );

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
  const samplePending = (samplePendingRes.data ?? []) as unknown as Array<{
    id: string; request_number: string; created_at: string | null;
    account_id: string | null;
    sales_reps: { full_name: string | null } | null;
    accounts: { business_name: string | null } | null;
  }>;
  const samplePendingCount = samplePendingRes.count ?? samplePending.length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-display text-3xl">
              Hola, {rep.full_name.split(" ")[0]}
            </h1>
            <OnlinePill initialOnline={onlineNow} />
          </div>
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

      {isAdmin && samplePendingCount > 0 && (
        <Link
          href="/muestras"
          className="flex items-center justify-between gap-3 rounded-xl border border-brand-carmesi/30 bg-brand-carmesi/5 p-4 transition-colors hover:bg-brand-carmesi/10"
        >
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-carmesi text-white">
              <FlaskConical className="h-5 w-5" />
            </span>
            <div>
              <div className="font-medium">
                {samplePendingCount === 1
                  ? "1 solicitud de muestras espera tu aprobación"
                  : `${samplePendingCount} solicitudes de muestras esperan tu aprobación`}
              </div>
              <div className="text-xs text-muted-foreground">
                Toca para revisar y autorizar
              </div>
            </div>
          </div>
          <Badge variant="warning">Revisar</Badge>
        </Link>
      )}

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

      {(isAdmin && (samplePending.length > 0 || restockPending.length > 0 || supplierDue.length > 0)) && (
        <div className="grid gap-6 lg:grid-cols-2">
          {samplePending.length > 0 && (
            <div className="space-y-3">
              <h2 className="font-display text-xl">Muestras por aprobar</h2>
              <Card><CardContent className="space-y-2 p-4">
                {samplePending.map((s) => (
                  <Link key={s.id} href={`/muestras/${s.id}`} className="flex items-center justify-between gap-2 rounded-md border bg-card p-3 hover:border-brand-carmesi">
                    <div><div className="font-medium">{s.request_number}</div><div className="text-xs text-muted-foreground">{s.sales_reps?.full_name ?? "—"}{s.accounts?.business_name ? ` · ${s.accounts.business_name}` : ""} · {formatDate(s.created_at)}</div></div>
                    <Badge variant="warning">Revisar</Badge>
                  </Link>
                ))}
              </CardContent></Card>
            </div>
          )}
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

      <div className="space-y-3">
        <h2 className="flex flex-wrap items-center gap-2 font-display text-xl">
          <AlarmClock className="h-5 w-5 text-amber-600" /> Visitar pronto
          <span className="text-sm font-normal text-muted-foreground">
            · prospectos y clientes sin actividad en 30+ días
          </span>
        </h2>
        {stale.length ? (
          <Card>
            <CardContent className="grid gap-2 p-3 sm:grid-cols-2">
              {stale.map((s) => {
                const days = daysSince(s.last_activity_date);
                const u = staleUrgency(days);
                return (
                  <Link
                    key={s.account_id}
                    href={`/actividades/nueva?estado=agendada&account=${s.account_id}`}
                    className="flex items-center justify-between gap-2 rounded-md border bg-card p-2.5 hover:border-brand-carmesi"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">
                        {s.business_name ?? "—"}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {s.status === "prospecto" ? "Prospecto" : "Cliente"}
                        {s.region ? ` · ${s.region}` : ""}
                        {isAdmin && s.assigned_rep_id && repFirst[s.assigned_rep_id]
                          ? ` · ${repFirst[s.assigned_rep_id]}`
                          : ""}
                        {staleContactCounts[s.account_id] ? (
                          <span className="text-emerald-700">
                            {` · ${staleContactCounts[s.account_id]} contacto${staleContactCounts[s.account_id] === 1 ? "" : "s"}`}
                          </span>
                        ) : (
                          " · sin contactos"
                        )}
                      </div>
                    </div>
                    <span
                      className="shrink-0 rounded-full px-2 py-0.5 text-xs font-medium"
                      style={{ backgroundColor: u.bg, color: u.fg }}
                    >
                      {u.label}
                    </span>
                  </Link>
                );
              })}
            </CardContent>
          </Card>
        ) : (
          <EmptyState
            icon={CalendarCheck2}
            title="Todo al día"
            description="No hay cuentas sin actividad reciente."
          />
        )}
      </div>

      {birthdays.length > 0 && (
        <div className="space-y-3">
          <h2 className="flex flex-wrap items-center gap-2 font-display text-xl">
            <Cake className="h-5 w-5 text-brand-carmesi" /> Próximos cumpleaños
            <span className="text-sm font-normal text-muted-foreground">
              · mándales un detalle (siguientes 30 días)
            </span>
          </h2>
          <Card>
            <CardContent className="grid gap-2 p-3 sm:grid-cols-2">
              {birthdays.map((b) => {
                const wa = (b.whatsapp ?? b.phone ?? "").replace(/\D/g, "");
                return (
                  <div
                    key={b.contact_id}
                    className="flex items-center justify-between gap-2 rounded-md border bg-card p-2.5"
                  >
                    <Link href={`/cuentas/${b.account_id}?tab=contactos`} className="min-w-0">
                      <div className="truncate text-sm font-medium">{b.full_name}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {b.business_name ?? "—"}
                        {b.role ? ` · ${b.role}` : ""} · {formatBirthday(b.birthday)}
                      </div>
                    </Link>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <Badge variant={b.days_until === 0 ? "danger" : b.days_until <= 7 ? "warning" : "muted"}>
                        {b.days_until === 0 ? "¡Hoy!" : b.days_until === 1 ? "Mañana" : `${b.days_until} días`}
                      </Badge>
                      {wa && (
                        <a
                          href={`https://wa.me/${wa}`}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-md border border-green-600/30 p-1.5 text-green-700 hover:bg-green-50"
                          aria-label="WhatsApp"
                        >
                          <MessageCircle className="h-3.5 w-3.5" />
                        </a>
                      )}
                      {b.phone && (
                        <a
                          href={`tel:${b.phone}`}
                          className="rounded-md border p-1.5 hover:bg-muted"
                          aria-label="Llamar"
                        >
                          <Phone className="h-3.5 w-3.5" />
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>
      )}

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
