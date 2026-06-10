// Inventario de consignaciones (TERAVINO Flow / Base44). Read-only.
// Todas las consignaciones son inventariables, así que listamos TODAS las
// consignaciones (no solo las que ya tienen toma) y cruzamos cada una con su
// toma de inventario más reciente para mostrar la cobertura.
// Scope: admin ve todas; vendedor ve solo las suyas (match por email).

import Link from "next/link";
import { ClipboardList, Filter, PackageSearch } from "lucide-react";
import { requireRep } from "@/lib/auth";
import { canAccessFacturacion } from "@/lib/modules";
import {
  base44,
  resolveBase44Vendedor,
  type Base44Consignacion,
  type Base44TomaInventario,
} from "@/lib/base44";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate, formatDateTime } from "@/lib/utils";

export const metadata = { title: "Tomas de inventario — TERAVINO CRM" };
export const dynamic = "force-dynamic";

type EstadoToma = Base44TomaInventario["estado"];
const ESTADO_TOMA_LABEL: Record<EstadoToma, string> = {
  borrador: "Borrador",
  firmado: "Firmado",
  sincronizado_drive: "En Drive",
  anulado: "Anulado",
};
const ESTADO_TOMA_VARIANT: Record<
  EstadoToma,
  "default" | "outline" | "accent" | "success" | "warning" | "danger" | "muted"
> = {
  borrador: "muted",
  firmado: "accent",
  sincronizado_drive: "success",
  anulado: "danger",
};

type EstadoConsig = Base44Consignacion["estado"];
const ESTADOS_CONSIG: EstadoConsig[] = ["pendiente", "parcial", "liquidada", "devuelta"];
const ESTADO_CONSIG_LABEL: Record<EstadoConsig, string> = {
  pendiente: "Pendiente",
  parcial: "Parcial",
  liquidada: "Liquidada",
  devuelta: "Devuelta",
};
const ESTADO_CONSIG_VARIANT: Record<
  EstadoConsig,
  "default" | "outline" | "accent" | "success" | "warning" | "danger" | "muted"
> = {
  pendiente: "warning",
  parcial: "accent",
  liquidada: "success",
  devuelta: "danger",
};

type Auditoria = NonNullable<Base44TomaInventario["auditoria_resultado"]>;
const AUDITORIA_LABEL: Record<Auditoria, string> = {
  no_evaluada: "Sin evaluar",
  aprobada: "Aprobada",
  sospechosa: "Sospechosa",
  no_auditada: "No auditada",
  requiere_validacion: "Requiere validación",
};
const AUDITORIA_VARIANT: Record<
  Auditoria,
  "default" | "outline" | "accent" | "success" | "warning" | "danger" | "muted"
> = {
  no_evaluada: "muted",
  aprobada: "success",
  sospechosa: "warning",
  no_auditada: "outline",
  requiere_validacion: "danger",
};

const requiereAtencion = (a?: Auditoria | null) =>
  a === "sospechosa" || a === "requiere_validacion";

// Cobertura de inventario que se puede filtrar.
type Cobertura = "" | "con" | "sin" | "atencion";

export default async function TomasPage({
  searchParams,
}: {
  searchParams: { estado?: string; inv?: string };
}) {
  const rep = await requireRep();
  const isAdmin = canAccessFacturacion(rep.role);
  const estadoParam = (searchParams.estado ?? "") as EstadoConsig | "";
  const invParam = (searchParams.inv ?? "") as Cobertura;

  let scopeVendedorId: string | null = null;
  if (!isAdmin) {
    const v = await resolveBase44Vendedor(rep.email);
    if (!v) {
      return (
        <EmptyState
          icon={ClipboardList}
          title="Tu usuario no está enlazado a un vendedor en TERAVINO Flow"
          description={`No encontré un Vendedor con email "${rep.email}" en Base44.`}
        />
      );
    }
    scopeVendedorId = v.id;
  }

  // 1) Todas las consignaciones (scoped) — cada una es inventariable.
  const consigQuery: Record<string, unknown> = {};
  if (scopeVendedorId) consigQuery.vendedor_id = scopeVendedorId;
  if (estadoParam && ESTADOS_CONSIG.includes(estadoParam as EstadoConsig)) {
    consigQuery.estado = estadoParam;
  }

  // 2) Todas las tomas (scoped) para cruzar con su consignación.
  const tomaQuery: Record<string, unknown> = {};
  if (scopeVendedorId) tomaQuery.vendedor_id = scopeVendedorId;

  let consignaciones: Base44Consignacion[] = [];
  let tomas: Base44TomaInventario[] = [];
  let loadError: string | null = null;
  try {
    [consignaciones, tomas] = await Promise.all([
      base44.entity<Base44Consignacion>("Consignacion").list({
        q: consigQuery,
        sort_by: "-fecha",
        limit: 500,
      }),
      base44.entity<Base44TomaInventario>("TomaInventario").list({
        q: tomaQuery,
        sort_by: "-fecha_toma",
        limit: 500,
      }),
    ]);
  } catch (e) {
    loadError = e instanceof Error ? e.message : String(e);
  }

  // Agrupamos tomas por consignación (ya vienen ordenadas por -fecha_toma,
  // así que la primera de cada grupo es la más reciente).
  const tomasPorConsignacion = new Map<string, Base44TomaInventario[]>();
  for (const t of tomas) {
    if (!t.consignacion_id) continue;
    const arr = tomasPorConsignacion.get(t.consignacion_id);
    if (arr) arr.push(t);
    else tomasPorConsignacion.set(t.consignacion_id, [t]);
  }

  // Filas: una por consignación + las tomas huérfanas (sin consignación vinculada)
  // para no perder información que hoy sí se ve.
  type Fila =
    | { kind: "consig"; c: Base44Consignacion; toma: Base44TomaInventario | null; count: number }
    | { kind: "huerfana"; t: Base44TomaInventario };

  const consigIds = new Set(consignaciones.map((c) => c.id));
  let filas: Fila[] = consignaciones.map((c) => {
    const grupo = tomasPorConsignacion.get(c.id) ?? [];
    return { kind: "consig" as const, c, toma: grupo[0] ?? null, count: grupo.length };
  });

  // Tomas cuyo consignacion_id no está en el set cargado (o sin vincular).
  const huerfanas = tomas.filter((t) => !t.consignacion_id || !consigIds.has(t.consignacion_id));
  // Si filtramos por estado de consignación, no mostramos huérfanas (no aplican).
  if (!estadoParam) {
    filas = filas.concat(huerfanas.map((t) => ({ kind: "huerfana" as const, t })));
  }

  // Filtro de cobertura de inventario (post-join).
  const tomaDeFila = (f: Fila): Base44TomaInventario | null =>
    f.kind === "consig" ? f.toma : f.t;
  if (invParam === "con") {
    filas = filas.filter((f) => tomaDeFila(f) !== null);
  } else if (invParam === "sin") {
    filas = filas.filter((f) => f.kind === "consig" && f.toma === null);
  } else if (invParam === "atencion") {
    filas = filas.filter((f) => requiereAtencion(tomaDeFila(f)?.auditoria_resultado));
  }

  // Stats — siempre sobre el universo de consignaciones (no sobre el filtro de cobertura).
  const totalConsig = consignaciones.length;
  const conInventario = consignaciones.filter((c) => tomasPorConsignacion.has(c.id)).length;
  const pendientes = totalConsig - conInventario;
  const atencion = consignaciones.filter((c) =>
    requiereAtencion(tomasPorConsignacion.get(c.id)?.[0]?.auditoria_resultado),
  ).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl">Tomas de inventario</h1>
          <p className="text-sm text-muted-foreground">
            {isAdmin
              ? `Todas las consignaciones son inventariables — ${totalConsig} consignaciones · ${conInventario} con toma · ${pendientes} pendientes.`
              : `Tus consignaciones — ${totalConsig} en total · ${conInventario} con toma · ${pendientes} pendientes.`}
          </p>
        </div>
      </div>

      <Card>
        <CardContent className="space-y-2 p-4 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <PackageSearch className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Inventario:</span>
            <FilterPill href={paramsLink({ estado: estadoParam, inv: "" })} active={!invParam} label="Todas" />
            <FilterPill href={paramsLink({ estado: estadoParam, inv: "con" })} active={invParam === "con"} label="Con toma" />
            <FilterPill href={paramsLink({ estado: estadoParam, inv: "sin" })} active={invParam === "sin"} label="Pendientes" />
            <FilterPill href={paramsLink({ estado: estadoParam, inv: "atencion" })} active={invParam === "atencion"} label="Requieren atención" />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Consignación:</span>
            <FilterPill href={paramsLink({ estado: "", inv: invParam })} active={!estadoParam} label="Todas" />
            {ESTADOS_CONSIG.map((e) => (
              <FilterPill
                key={e}
                href={paramsLink({ estado: e, inv: invParam })}
                active={estadoParam === e}
                label={ESTADO_CONSIG_LABEL[e]}
              />
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Consignaciones" value={totalConsig.toLocaleString("es-MX")} />
        <StatCard label="Con inventario" value={conInventario.toLocaleString("es-MX")} />
        <StatCard
          label="Pendientes de inventario"
          value={pendientes.toLocaleString("es-MX")}
          highlight={pendientes > 0}
        />
        <StatCard
          label="Requieren atención"
          value={String(atencion)}
          highlight={atencion > 0}
        />
      </div>

      {loadError ? (
        <EmptyState
          icon={ClipboardList}
          title="No pudimos cargar las consignaciones"
          description={
            loadError.includes("BASE44_API_KEY")
              ? "Falta configurar BASE44_API_KEY en Vercel."
              : loadError
          }
        />
      ) : filas.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="Sin consignaciones"
          description="No hay consignaciones con los filtros actuales."
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 text-left">Consignación</th>
                    <th className="px-4 py-2 text-left">Cliente</th>
                    {isAdmin && <th className="px-4 py-2 text-left">Vendedor</th>}
                    <th className="px-4 py-2 text-left">Estado</th>
                    <th className="px-4 py-2 text-left">Inventario</th>
                    <th className="px-4 py-2 text-right">Botellas</th>
                    <th className="px-4 py-2 text-left">Auditoría</th>
                  </tr>
                </thead>
                <tbody>
                  {filas.map((f) =>
                    f.kind === "consig" ? (
                      <ConsigRow key={`c-${f.c.id}`} c={f.c} toma={f.toma} count={f.count} isAdmin={isAdmin} />
                    ) : (
                      <HuerfanaRow key={`h-${f.t.id}`} t={f.t} isAdmin={isAdmin} />
                    ),
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ConsigRow({
  c,
  toma,
  count,
  isAdmin,
}: {
  c: Base44Consignacion;
  toma: Base44TomaInventario | null;
  count: number;
  isAdmin: boolean;
}) {
  return (
    <tr className="border-t hover:bg-muted/20">
      <td className="px-4 py-2 whitespace-nowrap">
        <Link href={`/consignaciones/${c.id}`} className="text-brand-carmesi hover:underline">
          {formatDate(c.fecha)}
        </Link>
      </td>
      <td className="px-4 py-2">{c.cliente_nombre ?? "—"}</td>
      {isAdmin && <td className="px-4 py-2">{c.vendedor_nombre ?? "—"}</td>}
      <td className="px-4 py-2">
        <Badge variant={ESTADO_CONSIG_VARIANT[c.estado]}>{ESTADO_CONSIG_LABEL[c.estado]}</Badge>
      </td>
      <td className="px-4 py-2">
        {toma ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <Link
              href={`/consignaciones/tomas/${toma.id}`}
              className="text-brand-carmesi hover:underline"
            >
              {toma.numero_toma ?? toma.id.slice(0, 8)}
            </Link>
            <Badge variant={ESTADO_TOMA_VARIANT[toma.estado]}>{ESTADO_TOMA_LABEL[toma.estado]}</Badge>
            <span className="text-xs text-muted-foreground">{formatDateTime(toma.fecha_toma)}</span>
            {count > 1 && (
              <span className="text-xs text-muted-foreground">· {count} tomas</span>
            )}
          </div>
        ) : (
          <Badge variant="outline">Pendiente de inventario</Badge>
        )}
      </td>
      <td className="px-4 py-2 text-right">{toma ? toma.total_botellas ?? 0 : "—"}</td>
      <td className="px-4 py-2">
        {toma?.auditoria_resultado ? (
          <Badge variant={AUDITORIA_VARIANT[toma.auditoria_resultado]}>
            {AUDITORIA_LABEL[toma.auditoria_resultado]}
            {typeof toma.auditoria_score === "number" ? ` · ${toma.auditoria_score}` : ""}
          </Badge>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>
    </tr>
  );
}

function HuerfanaRow({ t, isAdmin }: { t: Base44TomaInventario; isAdmin: boolean }) {
  return (
    <tr className="border-t hover:bg-muted/20">
      <td className="px-4 py-2 whitespace-nowrap text-muted-foreground">— sin vincular —</td>
      <td className="px-4 py-2">{t.cliente_nombre ?? "—"}</td>
      {isAdmin && <td className="px-4 py-2">{t.vendedor_nombre ?? "—"}</td>}
      <td className="px-4 py-2 text-muted-foreground">—</td>
      <td className="px-4 py-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <Link href={`/consignaciones/tomas/${t.id}`} className="text-brand-carmesi hover:underline">
            {t.numero_toma ?? t.id.slice(0, 8)}
          </Link>
          <Badge variant={ESTADO_TOMA_VARIANT[t.estado]}>{ESTADO_TOMA_LABEL[t.estado]}</Badge>
          <span className="text-xs text-muted-foreground">{formatDateTime(t.fecha_toma)}</span>
        </div>
      </td>
      <td className="px-4 py-2 text-right">{t.total_botellas ?? 0}</td>
      <td className="px-4 py-2">
        {t.auditoria_resultado ? (
          <Badge variant={AUDITORIA_VARIANT[t.auditoria_resultado]}>
            {AUDITORIA_LABEL[t.auditoria_resultado]}
            {typeof t.auditoria_score === "number" ? ` · ${t.auditoria_score}` : ""}
          </Badge>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>
    </tr>
  );
}

function paramsLink({ estado, inv }: { estado: string; inv: string }) {
  const sp = new URLSearchParams();
  if (estado) sp.set("estado", estado);
  if (inv) sp.set("inv", inv);
  const qs = sp.toString();
  return qs ? `/consignaciones/tomas?${qs}` : "/consignaciones/tomas";
}

function FilterPill({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      className={
        active
          ? "rounded-full bg-brand-carmesi px-3 py-1 text-xs font-medium text-white"
          : "rounded-full bg-muted px-3 py-1 text-xs text-foreground/70 hover:bg-muted/70"
      }
    >
      {label}
    </Link>
  );
}

function StatCard({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs uppercase text-muted-foreground">{label}</p>
        <p className={highlight ? "font-display text-2xl text-amber-700" : "font-display text-2xl"}>
          {value}
        </p>
      </CardContent>
    </Card>
  );
}
