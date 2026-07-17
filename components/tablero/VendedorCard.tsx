// Tarjeta por vendedor del Tablero (nivel 2 — el foco). Tres bloques: Ventas,
// Actividad (disciplina comercial) y Cuentas en riesgo, más la lista accionable
// "Pendientes de la semana" con acceso directo a registrar actividad (mismo
// flujo /actividades/nueva?account=… que usa "Visitar pronto" del Dashboard).
// Server component.

import Link from "next/link";
import { AlarmClock, ArrowDownRight, ArrowUpRight, CalendarPlus, Minus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";
import { VENDEDOR_TARGETS, semaforoKpi, type SemaforoColor } from "@/config/kpi-targets";
import type { PendienteItem, VendedorKpis } from "@/lib/kpis/data";

const TIPO_LABEL: Record<string, string> = {
  visita: "Visitas",
  llamada: "Llamadas",
  degustacion: "Degustaciones",
  email: "Emails",
  whatsapp: "WhatsApp",
  reunion: "Reuniones",
  evento: "Eventos",
  otro: "Otras",
};

const DOT: Record<SemaforoColor, string> = {
  verde: "bg-emerald-500",
  ambar: "bg-amber-500",
  rojo: "bg-red-500",
};

const PENDIENTE_BADGE: Record<PendienteItem["tipo"], { label: string; variant: "danger" | "warning" | "muted" }> = {
  siguiente_vencido: { label: "Siguiente vencido", variant: "danger" },
  sin_pedido: { label: "Sin pedido", variant: "warning" },
  inactiva: { label: "Inactiva", variant: "muted" },
};

function lastSeenLabel(iso: string | null): string {
  if (!iso) return "Nunca";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 5 * 60_000) return "En línea";
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs} h`;
  return `hace ${Math.floor(hrs / 24)} d`;
}

function Delta({ actual, anterior, lowerIsBetter = false }: { actual: number; anterior: number; lowerIsBetter?: boolean }) {
  if (anterior <= 0) return null;
  const pct = ((actual - anterior) / anterior) * 100;
  const up = pct > 0.05;
  const down = pct < -0.05;
  const good = up ? !lowerIsBetter : down ? lowerIsBetter : true;
  const Icon = up ? ArrowUpRight : down ? ArrowDownRight : Minus;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-xs font-medium ${
        up || down ? (good ? "text-emerald-700" : "text-red-600") : "text-muted-foreground"
      }`}
    >
      <Icon className="h-3 w-3" />
      {`${pct > 0 ? "+" : ""}${pct.toFixed(1)}% MoM`}
    </span>
  );
}

function MiniStat({
  label,
  value,
  kpiKey,
  rawValue,
  danger,
}: {
  label: string;
  value: React.ReactNode;
  /** Clave en VENDEDOR_TARGETS para pintar el semáforo. */
  kpiKey?: string;
  rawValue?: number | null;
  danger?: boolean;
}) {
  const target = kpiKey ? VENDEDOR_TARGETS[kpiKey] : undefined;
  const semaforo = target && rawValue != null ? semaforoKpi(rawValue, target) : null;
  return (
    <div className="rounded-md border bg-card p-2.5">
      <div className="flex items-center justify-between gap-1">
        <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</span>
        {semaforo && <span className={`h-2 w-2 shrink-0 rounded-full ${DOT[semaforo]}`} />}
      </div>
      <div className={`font-display text-lg ${danger ? "text-red-600" : ""}`}>{value}</div>
    </div>
  );
}

function ListaCuentas({ items, vacio }: { items: { accountId: string; nombre: string; extra: string }[]; vacio: string }) {
  if (!items.length) return <p className="text-xs text-muted-foreground">{vacio}</p>;
  return (
    <ul className="space-y-1">
      {items.map((c) => (
        <li key={c.accountId}>
          <Link href={`/cuentas/${c.accountId}`} className="text-sm hover:text-brand-carmesi">
            {c.nombre}
          </Link>
          <span className="text-xs text-muted-foreground"> · {c.extra}</span>
        </li>
      ))}
    </ul>
  );
}

export function VendedorCard({ v }: { v: VendedorKpis }) {
  const online = v.lastSeenAt && Date.now() - new Date(v.lastSeenAt).getTime() < 5 * 60_000;
  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        {/* Encabezado */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
          <div>
            <h3 className="font-display text-xl">{v.nombre}</h3>
            <p className="text-xs text-muted-foreground">
              {v.cuentasActivas} cuentas activas · última conexión:{" "}
              <span className={online ? "text-emerald-700" : v.lastSeenAt ? "" : "text-amber-700"}>
                {lastSeenLabel(v.lastSeenAt)}
              </span>
            </p>
          </div>
          <div className="text-right">
            <div className="font-display text-2xl text-brand-carmesi">{formatCurrency(v.ventaBruta)}</div>
            <div className="flex items-center justify-end gap-2 text-xs text-muted-foreground">
              {v.pctDelTotal != null && <span>{v.pctDelTotal.toFixed(1)}% del total</span>}
              <Delta actual={v.ventaMesRef} anterior={v.ventaMesPrev} />
            </div>
          </div>
        </div>

        {/* Bloque Ventas */}
        <div>
          <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Ventas <span className="normal-case">(mensual)</span>
          </h4>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <MiniStat label="Venta bruta" value={formatCurrency(v.ventaBruta)} kpiKey="venta_bruta" rawValue={v.ventaBruta} />
            <MiniStat label="Base comisión" value={formatCurrency(v.baseComision)} />
            <MiniStat label="Cuentas con compra" value={v.cuentasConCompra} />
            <MiniStat
              label="Ticket promedio"
              value={formatCurrency(v.ticketPromedio)}
              kpiKey="ticket_promedio"
              rawValue={v.ticketPromedio}
            />
          </div>
        </div>

        {/* Bloque Actividad — seguimiento SEMANAL */}
        <div>
          <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Actividad y disciplina <Badge variant="muted" className="ml-1 align-middle text-[10px]">semanal</Badge>
          </h4>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <MiniStat label="Actividades" value={v.actividades} kpiKey="actividades" rawValue={v.actividades} />
            <MiniStat
              label="Citas realizadas"
              value={
                v.cumplimientoCitas != null
                  ? `${v.citasRealizadas}/${v.citasRealizadas + v.citasAgendadas} (${Math.round(v.cumplimientoCitas)}%)`
                  : `${v.citasRealizadas}/${v.citasRealizadas + v.citasAgendadas}`
              }
              kpiKey="cumplimiento_citas"
              rawValue={v.cumplimientoCitas}
            />
            <MiniStat
              label="Siguientes vencidos"
              value={v.siguientesVencidos}
              kpiKey="siguientes_vencidos"
              rawValue={v.siguientesVencidos}
              danger={v.siguientesVencidos > 0}
            />
            <MiniStat
              label="Cobertura 30 días"
              value={v.cobertura != null ? `${Math.round(v.cobertura)}%` : "—"}
              kpiKey="cobertura_cartera"
              rawValue={v.cobertura}
            />
          </div>
          {v.porTipo.length > 0 && (
            <p className="mt-2 text-xs text-muted-foreground">
              {v.porTipo.map((t) => `${TIPO_LABEL[t.tipo] ?? t.tipo}: ${t.n}`).join(" · ")}
            </p>
          )}
        </div>

        {/* Bloque Cuentas en riesgo — seguimiento SEMANAL */}
        <div>
          <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Cuentas en riesgo <Badge variant="muted" className="ml-1 align-middle text-[10px]">semanal</Badge>
          </h4>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <MiniStat
              label="Inactivas 30+ días"
              value={v.inactivasTotal}
              kpiKey="cuentas_inactivas"
              rawValue={v.inactivasTotal}
              danger={v.inactivasTotal > 0}
            />
            <MiniStat
              label="Sin pedido este mes"
              value={v.sinPedidoTotal}
              kpiKey="clientes_sin_pedido"
              rawValue={v.sinPedidoTotal}
            />
            <MiniStat
              label="Vencidas / suspendidas"
              value={`${v.cuentasVencidas} / ${v.cuentasSuspendidas}`}
              danger={v.cuentasSuspendidas > 0}
            />
            <MiniStat
              label="Monto vencido"
              value={formatCurrency(v.montoVencido)}
              kpiKey="monto_vencido"
              rawValue={v.montoVencido}
              danger={v.montoVencido > 0}
            />
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <div>
              <p className="mb-1 text-xs font-medium">Cuentas inactivas</p>
              <ListaCuentas items={v.inactivas} vacio="Ninguna — cartera cubierta." />
              {v.inactivasTotal > v.inactivas.length && (
                <p className="mt-1 text-xs text-muted-foreground">…y {v.inactivasTotal - v.inactivas.length} más</p>
              )}
            </div>
            <div>
              <p className="mb-1 text-xs font-medium">Compraron el mes pasado y este no</p>
              <ListaCuentas items={v.sinPedido} vacio="Ninguno — sin caídas de compra." />
              {v.sinPedidoTotal > v.sinPedido.length && (
                <p className="mt-1 text-xs text-muted-foreground">…y {v.sinPedidoTotal - v.sinPedido.length} más</p>
              )}
            </div>
            <div>
              <p className="mb-1 text-xs font-medium">
                Prospectos sin gestión{" "}
                {v.prospectosSinGestion.length > 0 && (
                  <Badge variant="warning" className="align-middle">{v.prospectosSinGestion.length}</Badge>
                )}
              </p>
              <ListaCuentas items={v.prospectosSinGestion} vacio="Todos los prospectos tienen gestión." />
            </div>
          </div>
        </div>

        {/* Pendientes de la semana — lista accionable */}
        <div className="rounded-lg border border-brand-carmesi/20 bg-brand-carmesi/5 p-3">
          <h4 className="mb-2 flex items-center gap-1.5 text-sm font-medium">
            <AlarmClock className="h-4 w-4 text-brand-carmesi" /> Pendientes de la semana
          </h4>
          {v.pendientes.length === 0 ? (
            <p className="text-xs text-muted-foreground">Sin pendientes — todo al día. 🎉</p>
          ) : (
            <ul className="space-y-1.5">
              {v.pendientes.map((p, i) => {
                const badge = PENDIENTE_BADGE[p.tipo];
                return (
                  <li key={`${p.tipo}-${p.accountId}-${i}`} className="flex items-center justify-between gap-2 rounded-md border bg-card p-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <Badge variant={badge.variant} className="shrink-0 text-[10px]">{badge.label}</Badge>
                        {p.accountId ? (
                          <Link href={`/cuentas/${p.accountId}`} className="truncate text-sm font-medium hover:text-brand-carmesi">
                            {p.nombre}
                          </Link>
                        ) : (
                          <span className="truncate text-sm font-medium">{p.nombre}</span>
                        )}
                      </div>
                      <p className="truncate text-xs text-muted-foreground">{p.detalle}</p>
                    </div>
                    {p.accountId && (
                      <Link
                        href={`/actividades/nueva?estado=agendada&account=${p.accountId}`}
                        className="flex shrink-0 items-center gap-1 rounded-md border border-brand-carmesi/40 px-2 py-1 text-xs text-brand-carmesi hover:bg-brand-carmesi hover:text-white"
                      >
                        <CalendarPlus className="h-3.5 w-3.5" /> Registrar actividad
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
