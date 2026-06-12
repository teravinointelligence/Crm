// Dashboard de Reparto: KPIs del día, monitor de choferes y próximas entregas.

import { redirect } from "next/navigation";
import Link from "next/link";
import { Truck, Plus } from "lucide-react";
import { getCurrentRep } from "@/lib/auth";
import { canViewReparto, canManageReparto } from "@/lib/modules";
import { repartoAdmin } from "@/lib/supabase-reparto";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { UploadCFDI } from "@/components/reparto/UploadCFDI";
import { ESTATUS_LABEL, ESTATUS_VARIANT, type PedidoEstatus } from "@/types/reparto";
import { formatCurrency, formatDateTime } from "@/lib/utils";

export const metadata = { title: "Dashboard Reparto" };
export const dynamic = "force-dynamic";

type PedidoLite = {
  id: string;
  numero_factura: string;
  fecha: string;
  ventana_inicio: string | null;
  ventana_fin: string | null;
  estatus: PedidoEstatus;
  prioridad: string | null;
  total: number | null;
  clientes: { id: string; nombre: string; ciudad: string | null } | null;
  chofer: { id: string; nombre: string } | null;
};

export default async function DashboardRepartoPage() {
  const rep = await getCurrentRep();
  if (!rep) redirect("/login");
  if (!canViewReparto(rep.role)) redirect("/");
  const canManage = canManageReparto(rep.role);

  const today = new Date().toISOString().slice(0, 10);
  const startOfWeek = new Date();
  startOfWeek.setDate(startOfWeek.getDate() - 6);
  const startWeekISO = startOfWeek.toISOString().slice(0, 10);

  const [hoyRes, semanaRes, proximasRes, choferesRes, entregasHoyRes] = await Promise.all([
    repartoAdmin
      .from("pedidos")
      .select("id, estatus", { count: "exact", head: true })
      .eq("fecha", today),
    repartoAdmin
      .from("pedidos")
      .select("id, estatus, total, chofer_id, fecha")
      .gte("fecha", startWeekISO)
      .lte("fecha", today),
    repartoAdmin
      .from("pedidos")
      .select(
        "id, numero_factura, fecha, ventana_inicio, ventana_fin, estatus, prioridad, total, clientes:cliente_id(id, nombre, ciudad), chofer:chofer_id(id, nombre)",
      )
      .in("estatus", ["pendiente_asignar", "asignado", "en_ruta"])
      .order("fecha", { ascending: true })
      .order("ventana_inicio", { ascending: true })
      .limit(10),
    repartoAdmin
      .from("usuarios")
      .select("id, nombre, email, telefono")
      .eq("es_chofer", true)
      .eq("activo", true)
      .order("nombre"),
    repartoAdmin
      .from("entregas")
      .select("id, chofer_id")
      .gte("timestamp_entrega", `${today}T00:00:00`)
      .lte("timestamp_entrega", `${today}T23:59:59`),
  ]);

  const semana = (semanaRes.data ?? []) as Array<{ estatus: PedidoEstatus; total: number | null; chofer_id: string | null; fecha: string }>;
  const proximas = ((proximasRes.data ?? []) as unknown) as PedidoLite[];
  const choferes = (choferesRes.data ?? []) as Array<{ id: string; nombre: string; email: string; telefono: string | null }>;
  const entregasHoy = (entregasHoyRes.data ?? []) as Array<{ id: string; chofer_id: string | null }>;

  const hoy = semana.filter((p) => p.fecha === today);
  const kpis = {
    pedidosHoy: hoyRes.count ?? 0,
    pendientes: hoy.filter((p) => p.estatus === "pendiente_asignar").length,
    asignados: hoy.filter((p) => p.estatus === "asignado").length,
    enRuta: hoy.filter((p) => p.estatus === "en_ruta").length,
    entregados: hoy.filter((p) => p.estatus === "entregado").length,
    noEntregados: hoy.filter((p) => p.estatus === "no_entregado").length,
  };

  const totalSemana = semana.reduce((s, p) => s + (Number(p.total) || 0), 0);

  // Entregas completadas día a día (últimos 7 días): entregados vs pedidos
  // del día, para los anillos de progreso.
  const dias: { fecha: string; etiqueta: string; entregados: number; total: number; esHoy: boolean }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const f = d.toISOString().slice(0, 10);
    const delDia = semana.filter((p) => p.fecha === f);
    dias.push({
      fecha: f,
      etiqueta: d.toLocaleDateString("es-MX", { weekday: "short", day: "numeric" }),
      entregados: delDia.filter((p) => p.estatus === "entregado").length,
      total: delDia.length,
      esHoy: f === today,
    });
  }

  const cargaPorChofer = new Map<string, { en_ruta: number; asignado: number; entregadosHoy: number }>();
  for (const c of choferes) cargaPorChofer.set(c.id, { en_ruta: 0, asignado: 0, entregadosHoy: 0 });
  for (const p of hoy) {
    if (!p.chofer_id) continue;
    const m = cargaPorChofer.get(p.chofer_id);
    if (!m) continue;
    if (p.estatus === "asignado") m.asignado++;
    if (p.estatus === "en_ruta") m.en_ruta++;
  }
  for (const e of entregasHoy) {
    if (!e.chofer_id) continue;
    const m = cargaPorChofer.get(e.chofer_id);
    if (m) m.entregadosHoy++;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl">Dashboard de reparto</h1>
          <p className="text-sm text-muted-foreground">
            Operación del día — {new Date().toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" })}
          </p>
        </div>
        {canManage && (
          <div className="flex gap-2">
            <UploadCFDI />
            <Button asChild>
              <Link href="/reparto/pedidos/nuevo"><Plus className="mr-1 h-4 w-4" /> Nuevo pedido</Link>
            </Button>
          </div>
        )}
      </div>

      <section className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Kpi label="Pedidos hoy" value={kpis.pedidosHoy} />
        <Kpi label="Pendientes" value={kpis.pendientes} tone="muted" />
        <Kpi label="Asignados" value={kpis.asignados} tone="accent" />
        <Kpi label="En ruta" value={kpis.enRuta} tone="warning" />
        <Kpi label="Entregados" value={kpis.entregados} tone="ok" />
        <Kpi label="No entregados" value={kpis.noEntregados} tone={kpis.noEntregados > 0 ? "danger" : "muted"} />
      </section>

      <section>
        <Card><CardContent className="p-5">
          <div className="mb-4">
            <h3 className="font-display text-lg">Entregas completadas día a día</h3>
            <p className="text-xs text-muted-foreground">Pedidos entregados vs pedidos del día — últimos 7 días.</p>
          </div>
          <div className="flex flex-wrap items-end justify-between gap-3 sm:justify-start sm:gap-6">
            {dias.map((d) => (
              <DeliveryRing key={d.fecha} {...d} />
            ))}
          </div>
        </CardContent></Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <Card><CardContent className="space-y-1 p-5 lg:col-span-1">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Facturado últimos 7 días</p>
          <p className="font-display text-3xl text-brand-carmesi">{formatCurrency(totalSemana)}</p>
          <p className="text-xs text-muted-foreground">{semana.length} pedido(s) en la semana</p>
        </CardContent></Card>

        <Card className="lg:col-span-2"><CardContent className="p-0">
          <div className="border-b px-4 py-3">
            <h3 className="font-display text-lg">Carga por chofer (hoy)</h3>
            <p className="text-xs text-muted-foreground">Pedidos asignados, en ruta y entregas registradas.</p>
          </div>
          {choferes.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">Sin choferes activos.</p>
          ) : (
            <table className="min-w-full text-sm">
              <thead className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                <tr><th className="px-4 py-2">Chofer</th><th className="px-4 py-2 text-right">Asignados</th><th className="px-4 py-2 text-right">En ruta</th><th className="px-4 py-2 text-right">Entregados hoy</th></tr>
              </thead>
              <tbody>
                {choferes.map((c) => {
                  const m = cargaPorChofer.get(c.id) ?? { en_ruta: 0, asignado: 0, entregadosHoy: 0 };
                  return (
                    <tr key={c.id} className="border-b last:border-b-0">
                      <td className="px-4 py-2">
                        <div className="font-medium">{c.nombre}</div>
                        <div className="text-xs text-muted-foreground">{c.email}</div>
                      </td>
                      <td className="px-4 py-2 text-right">{m.asignado}</td>
                      <td className="px-4 py-2 text-right">{m.en_ruta}</td>
                      <td className="px-4 py-2 text-right text-emerald-700">{m.entregadosHoy}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent></Card>
      </section>

      <section>
        <Card><CardContent className="p-0">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div>
              <h3 className="font-display text-lg">Próximas entregas</h3>
              <p className="text-xs text-muted-foreground">Pendientes / asignados / en ruta — los siguientes 10.</p>
            </div>
            <Button asChild size="sm" variant="ghost"><Link href="/reparto/pedidos">Ver todos</Link></Button>
          </div>
          {proximas.length === 0 ? (
            <div className="flex flex-col items-center gap-2 p-8 text-center text-muted-foreground">
              <Truck className="h-6 w-6" />
              <p className="text-sm">Sin entregas pendientes. ¡Todo al corriente!</p>
            </div>
          ) : (
            <table className="min-w-full text-sm">
              <thead className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                <tr><th className="px-4 py-2">Folio</th><th className="px-4 py-2">Cliente</th><th className="px-4 py-2">Chofer</th><th className="px-4 py-2">Fecha / ventana</th><th className="px-4 py-2">Estatus</th><th className="px-4 py-2 text-right">Total</th></tr>
              </thead>
              <tbody>
                {proximas.map((p) => (
                  <tr key={p.id} className="border-b last:border-b-0 hover:bg-muted/30">
                    <td className="px-4 py-2 font-medium">
                      <Link href={`/reparto/pedidos/${p.id}`} className="hover:text-brand-carmesi">{p.numero_factura}</Link>
                      {p.prioridad && p.prioridad !== "normal" && <Badge variant="warning" className="ml-2 text-[10px]">{p.prioridad}</Badge>}
                    </td>
                    <td className="px-4 py-2">
                      {p.clientes?.nombre ?? "—"}
                      {p.clientes?.ciudad && <div className="text-xs text-muted-foreground">{p.clientes.ciudad}</div>}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">{p.chofer?.nombre ?? <span className="text-amber-700">sin asignar</span>}</td>
                    <td className="px-4 py-2 text-muted-foreground text-xs">
                      {p.fecha}
                      {p.ventana_inicio && ` · ${p.ventana_inicio.slice(0, 5)}${p.ventana_fin ? `–${p.ventana_fin.slice(0, 5)}` : ""}`}
                    </td>
                    <td className="px-4 py-2"><Badge variant={ESTATUS_VARIANT[p.estatus]}>{ESTATUS_LABEL[p.estatus]}</Badge></td>
                    <td className="px-4 py-2 text-right">{formatCurrency(p.total)}</td>
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

// Anillo de progreso de un día: arco esmeralda = % de pedidos entregados.
// Server component puro (SVG estático, sin JS en el cliente).
function DeliveryRing({
  etiqueta,
  entregados,
  total,
  esHoy,
}: {
  etiqueta: string;
  entregados: number;
  total: number;
  esHoy: boolean;
}) {
  const R = 26;
  const C = 2 * Math.PI * R;
  const pct = total > 0 ? Math.min(1, entregados / total) : 0;
  const completo = total > 0 && entregados >= total;
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative">
        <svg viewBox="0 0 64 64" className={esHoy ? "h-20 w-20" : "h-16 w-16"} role="img"
          aria-label={`${etiqueta}: ${entregados} de ${total} entregados`}>
          <circle cx="32" cy="32" r={R} fill="none" stroke="#e5e7eb" strokeWidth="6" />
          {total > 0 && (
            <circle
              cx="32" cy="32" r={R} fill="none"
              stroke={completo ? "#059669" : "#10b981"}
              strokeWidth="6" strokeLinecap="round"
              strokeDasharray={`${C * pct} ${C}`}
              transform="rotate(-90 32 32)"
            />
          )}
          <text x="32" y="36" textAnchor="middle" fontSize="13" fontWeight="600"
            fill={total === 0 ? "#9ca3af" : completo ? "#059669" : "#374151"}>
            {total === 0 ? "—" : `${entregados}/${total}`}
          </text>
        </svg>
        {completo && (
          <span className="absolute -right-1 -top-1 rounded-full bg-emerald-600 px-1 text-[10px] font-bold text-white">✓</span>
        )}
      </div>
      <span className={`text-xs capitalize ${esHoy ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
        {esHoy ? "Hoy" : etiqueta}
      </span>
    </div>
  );
}

function Kpi({ label, value, tone = "default" }: { label: string; value: number; tone?: "default" | "muted" | "accent" | "warning" | "ok" | "danger" }) {
  const cls =
    tone === "danger" ? "text-red-700" :
    tone === "warning" ? "text-amber-700" :
    tone === "ok" ? "text-emerald-700" :
    tone === "accent" ? "text-brand-carmesi" :
    tone === "muted" ? "text-muted-foreground" :
    "text-brand-carmesi";
  return (
    <Card><CardContent className="space-y-1 p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`font-display text-2xl ${cls}`}>{value}</p>
    </CardContent></Card>
  );
}
