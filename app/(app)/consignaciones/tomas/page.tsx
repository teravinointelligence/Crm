// Listado de Tomas de Inventario (TERAVINO Flow / Base44). Read-only.
// Scope: admin ve todas; vendedor ve solo las suyas (match por email).

import Link from "next/link";
import { ClipboardList, Filter, ShieldAlert } from "lucide-react";
import { requireRep } from "@/lib/auth";
import {
  base44,
  resolveBase44Vendedor,
  type Base44TomaInventario,
} from "@/lib/base44";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDateTime } from "@/lib/utils";

export const metadata = { title: "Tomas de inventario — TERAVINO CRM" };
export const dynamic = "force-dynamic";

type Estado = Base44TomaInventario["estado"];
const ESTADOS: Estado[] = ["borrador", "firmado", "sincronizado_drive", "anulado"];
const ESTADO_LABEL: Record<Estado, string> = {
  borrador: "Borrador",
  firmado: "Firmado",
  sincronizado_drive: "En Drive",
  anulado: "Anulado",
};
const ESTADO_VARIANT: Record<
  Estado,
  "default" | "outline" | "accent" | "success" | "warning" | "danger" | "muted"
> = {
  borrador: "muted",
  firmado: "accent",
  sincronizado_drive: "success",
  anulado: "danger",
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

export default async function TomasPage({
  searchParams,
}: {
  searchParams: { estado?: string; auditoria?: string };
}) {
  const rep = await requireRep();
  const isAdmin = rep.role === "admin";
  const estadoParam = (searchParams.estado ?? "") as Estado | "";
  const auditoriaParam = (searchParams.auditoria ?? "") as Auditoria | "";

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

  const query: Record<string, unknown> = {};
  if (scopeVendedorId) query.vendedor_id = scopeVendedorId;
  if (estadoParam && ESTADOS.includes(estadoParam as Estado)) query.estado = estadoParam;
  if (auditoriaParam && (AUDITORIA_LABEL as Record<string, string>)[auditoriaParam]) {
    query.auditoria_resultado = auditoriaParam;
  }

  let tomas: Base44TomaInventario[] = [];
  let loadError: string | null = null;
  try {
    tomas = await base44.entity<Base44TomaInventario>("TomaInventario").list({
      q: query,
      sort_by: "-fecha_toma",
      limit: 200,
    });
  } catch (e) {
    loadError = e instanceof Error ? e.message : String(e);
  }

  const totalBotellas = tomas.reduce((s, t) => s + (t.total_botellas ?? 0), 0);
  const totalEtiquetas = tomas.reduce((s, t) => s + (t.total_etiquetas ?? 0), 0);
  const sospechosas = tomas.filter(
    (t) => t.auditoria_resultado === "sospechosa" || t.auditoria_resultado === "requiere_validacion",
  ).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl">Tomas de inventario</h1>
          <p className="text-sm text-muted-foreground">
            {isAdmin
              ? `Todas las tomas de TERAVINO Flow (${tomas.length}).`
              : `Tus tomas (${tomas.length}).`}
          </p>
        </div>
      </div>

      <Card>
        <CardContent className="space-y-2 p-4 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Estado:</span>
            <FilterPill
              href={paramsLink({ estado: "", auditoria: auditoriaParam })}
              active={!estadoParam}
              label="Todos"
            />
            {ESTADOS.map((e) => (
              <FilterPill
                key={e}
                href={paramsLink({ estado: e, auditoria: auditoriaParam })}
                active={estadoParam === e}
                label={ESTADO_LABEL[e]}
              />
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Auditoría:</span>
            <FilterPill
              href={paramsLink({ estado: estadoParam, auditoria: "" })}
              active={!auditoriaParam}
              label="Todas"
            />
            {(Object.keys(AUDITORIA_LABEL) as Auditoria[]).map((a) => (
              <FilterPill
                key={a}
                href={paramsLink({ estado: estadoParam, auditoria: a })}
                active={auditoriaParam === a}
                label={AUDITORIA_LABEL[a]}
              />
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="Botellas contadas" value={totalBotellas.toLocaleString("es-MX")} />
        <StatCard label="Etiquetas distintas" value={totalEtiquetas.toLocaleString("es-MX")} />
        <StatCard
          label="Auditorías que requieren atención"
          value={String(sospechosas)}
          highlight={sospechosas > 0}
        />
      </div>

      {loadError ? (
        <EmptyState
          icon={ClipboardList}
          title="No pudimos cargar las tomas"
          description={
            loadError.includes("BASE44_API_KEY")
              ? "Falta configurar BASE44_API_KEY en Vercel."
              : loadError
          }
        />
      ) : tomas.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="Sin tomas de inventario"
          description="Aún no hay tomas registradas con los filtros actuales."
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 text-left">Folio</th>
                    <th className="px-4 py-2 text-left">Fecha</th>
                    <th className="px-4 py-2 text-left">Cliente</th>
                    {isAdmin && <th className="px-4 py-2 text-left">Vendedor</th>}
                    <th className="px-4 py-2 text-right">Botellas</th>
                    <th className="px-4 py-2 text-right">Etiquetas</th>
                    <th className="px-4 py-2 text-left">Estado</th>
                    <th className="px-4 py-2 text-left">Auditoría</th>
                  </tr>
                </thead>
                <tbody>
                  {tomas.map((t) => (
                    <tr key={t.id} className="border-t hover:bg-muted/20">
                      <td className="px-4 py-2 whitespace-nowrap">
                        <Link
                          href={`/consignaciones/tomas/${t.id}`}
                          className="text-brand-carmesi hover:underline"
                        >
                          {t.numero_toma ?? t.id.slice(0, 8)}
                        </Link>
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap">{formatDateTime(t.fecha_toma)}</td>
                      <td className="px-4 py-2">{t.cliente_nombre ?? "—"}</td>
                      {isAdmin && <td className="px-4 py-2">{t.vendedor_nombre ?? "—"}</td>}
                      <td className="px-4 py-2 text-right">{t.total_botellas ?? 0}</td>
                      <td className="px-4 py-2 text-right">{t.total_etiquetas ?? 0}</td>
                      <td className="px-4 py-2">
                        <Badge variant={ESTADO_VARIANT[t.estado]}>{ESTADO_LABEL[t.estado]}</Badge>
                      </td>
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
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function paramsLink({ estado, auditoria }: { estado: string; auditoria: string }) {
  const sp = new URLSearchParams();
  if (estado) sp.set("estado", estado);
  if (auditoria) sp.set("auditoria", auditoria);
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

