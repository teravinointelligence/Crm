// Detalle de una Toma de Inventario. Read-only.
// Scope: admin siempre; vendedor solo si la toma es suya.

import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Calendar,
  User as UserIcon,
  Building2,
  MapPin,
  FileCheck2,
  ShieldAlert,
  FileText,
  Hash,
} from "lucide-react";
import { requireRep } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  base44,
  resolveBase44Vendedor,
  type Base44Cliente,
  type Base44Consignacion,
  type Base44TomaInventario,
} from "@/lib/base44";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FacturarConsumoDialog } from "@/components/consignaciones/FacturarConsumoDialog";
import { formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

const ESTADO_LABEL: Record<Base44TomaInventario["estado"], string> = {
  borrador: "Borrador",
  firmado: "Firmado",
  sincronizado_drive: "En Drive",
  anulado: "Anulado",
};
const ESTADO_VARIANT: Record<
  Base44TomaInventario["estado"],
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

export default async function TomaDetailPage({ params }: { params: { id: string } }) {
  const rep = await requireRep();
  const isAdmin = rep.role === "admin";

  let toma: Base44TomaInventario;
  try {
    toma = await base44.entity<Base44TomaInventario>("TomaInventario").get(params.id);
  } catch {
    notFound();
  }

  if (!isAdmin) {
    const v = await resolveBase44Vendedor(rep.email);
    if (!v || v.id !== toma.vendedor_id) {
      notFound();
    }
  }

  let cliente: Base44Cliente | null = null;
  try {
    cliente = await base44.entity<Base44Cliente>("Cliente").get(toma.cliente_id);
  } catch {
    cliente = null;
  }

  // Consignación vinculada (para precios + acción de facturar consumo).
  let consignacion: Base44Consignacion | null = null;
  if (toma.consignacion_id) {
    try {
      consignacion = await base44.entity<Base44Consignacion>("Consignacion").get(toma.consignacion_id);
    } catch {
      consignacion = null;
    }
  }

  const supabase = createClient();
  let crmAccount: { id: string; business_name: string } | null = null;
  if (cliente?.numero_cliente) {
    const { data } = await supabase
      .from("accounts")
      .select("id, business_name")
      .eq("client_number", cliente.numero_cliente)
      .maybeSingle();
    if (data) crmAccount = data;
  }

  const items = toma.items ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/consignaciones/tomas">
            <ArrowLeft className="h-4 w-4" />
            <span className="ml-1">Volver</span>
          </Link>
        </Button>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl">
            {toma.numero_toma ?? `Toma ${toma.id.slice(0, 8)}`}
          </h1>
          <p className="text-sm text-muted-foreground">{toma.cliente_nombre ?? "—"}</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <Badge variant={ESTADO_VARIANT[toma.estado]} className="text-sm">
            {ESTADO_LABEL[toma.estado]}
          </Badge>
          {toma.auditoria_resultado && (
            <Badge variant={AUDITORIA_VARIANT[toma.auditoria_resultado]}>
              <ShieldAlert className="mr-1 h-3 w-3" />
              {AUDITORIA_LABEL[toma.auditoria_resultado]}
              {typeof toma.auditoria_score === "number" ? ` · ${toma.auditoria_score}` : ""}
            </Badge>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <InfoCard icon={Calendar} label="Fecha de toma" value={formatDateTime(toma.fecha_toma)} />
        <InfoCard icon={UserIcon} label="Vendedor" value={toma.vendedor_nombre ?? "—"} />
        <InfoCard icon={Building2} label="Almacén CONTPAQ i" value={toma.almacen ?? "—"} />
        <InfoCard icon={Hash} label="Etiquetas / botellas" value={`${toma.total_etiquetas ?? 0} / ${toma.total_botellas ?? 0}`} />
      </div>

      {toma.consignacion_id ? (
        <Card>
          <CardContent className="space-y-4 p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs uppercase text-muted-foreground">Reconcilia la consignación</p>
                <p className="font-medium">{toma.consignacion_numero ?? toma.consignacion_id}</p>
              </div>
              <Button variant="outline" asChild>
                <Link href={`/consignaciones/${toma.consignacion_id}`}>Ver consignación →</Link>
              </Button>
            </div>
            {consignacion && (
              <div className="border-t pt-4">
                <FacturarConsumoDialog toma={toma} consignacionItems={consignacion.items} />
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-4 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md">
            ⚠️ Esta toma no está vinculada a ninguna consignación. Toda toma debería estar sobre una consignación.
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="space-y-3 p-6">
          <h2 className="font-display text-lg">Cliente</h2>
          <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
            <div>
              <p className="text-xs uppercase text-muted-foreground">Nombre comercial</p>
              <p>{cliente?.nombre ?? toma.cliente_nombre ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs uppercase text-muted-foreground"># cliente CONTPAQ i</p>
              <p>{cliente?.numero_cliente ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs uppercase text-muted-foreground">Razón social</p>
              <p>{cliente?.razon_social ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs uppercase text-muted-foreground">Locación</p>
              <p>{cliente?.locacion ?? "—"}</p>
            </div>
          </div>
          {crmAccount && (
            <Button variant="outline" size="sm" asChild>
              <Link href={`/cuentas/${crmAccount.id}`}>Ver ficha en el CRM →</Link>
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="border-b p-4">
            <h2 className="font-display text-lg">Conteo por producto</h2>
          </div>
          {items.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              Sin items en la toma.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 text-left">Producto</th>
                    <th className="px-4 py-2 text-left">SKU</th>
                    <th className="px-4 py-2 text-left">Presentación</th>
                    <th className="px-4 py-2 text-right">Anterior</th>
                    <th className="px-4 py-2 text-right">Contada</th>
                    <th className="px-4 py-2 text-right">Diferencia</th>
                    <th className="px-4 py-2 text-left">Observación</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, i) => {
                    const diff = it.diferencia ?? (
                      (it.cantidad_contada ?? 0) - (it.cantidad_anterior ?? 0)
                    );
                    return (
                      <tr key={`${it.producto_id ?? "x"}-${i}`} className="border-t">
                        <td className="px-4 py-2">{it.producto_nombre ?? "—"}</td>
                        <td className="px-4 py-2 font-mono text-xs">{it.codigo ?? "—"}</td>
                        <td className="px-4 py-2">{it.presentacion ?? "—"}</td>
                        <td className="px-4 py-2 text-right">{it.cantidad_anterior ?? "—"}</td>
                        <td className="px-4 py-2 text-right font-medium">{it.cantidad_contada ?? "—"}</td>
                        <td
                          className={`px-4 py-2 text-right ${
                            diff > 0 ? "text-emerald-700" : diff < 0 ? "text-red-700" : ""
                          }`}
                        >
                          {diff > 0 ? `+${diff}` : diff}
                        </td>
                        <td className="px-4 py-2 text-xs text-muted-foreground">
                          {it.observacion_item ?? ""}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {(toma.firma_encargado || toma.firma_vendedor) && (
        <Card>
          <CardContent className="space-y-4 p-6">
            <h2 className="font-display text-lg">Firmas</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <SignatureBlock
                title="Encargado del cliente"
                name={toma.encargado_nombre}
                cargo={toma.encargado_cargo}
                dataUrl={toma.firma_encargado}
              />
              <SignatureBlock
                title="Vendedor TERAVINO"
                name={toma.vendedor_nombre}
                dataUrl={toma.firma_vendedor}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {toma.auditoria_resultado && toma.auditoria_resultado !== "no_evaluada" && (
        <Card>
          <CardContent className="space-y-3 p-6">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg">Auditoría</h2>
              <Badge variant={AUDITORIA_VARIANT[toma.auditoria_resultado]}>
                {AUDITORIA_LABEL[toma.auditoria_resultado]}
                {typeof toma.auditoria_score === "number" ? ` · score ${toma.auditoria_score}` : ""}
              </Badge>
            </div>
            {toma.auditoria_motivo && (
              <p className="text-sm whitespace-pre-line">{toma.auditoria_motivo}</p>
            )}
            {(toma.auditoria_flags ?? []).length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {toma.auditoria_flags!.map((f) => (
                  <code key={f} className="rounded bg-muted px-2 py-0.5 text-xs">{f}</code>
                ))}
              </div>
            )}
            <div className="grid grid-cols-1 gap-2 text-xs text-muted-foreground sm:grid-cols-2">
              {toma.auditoria_fecha && (
                <div>
                  <span className="font-medium">Evaluada:</span> {formatDateTime(toma.auditoria_fecha)}
                </div>
              )}
              {toma.auditoria_validada_por && (
                <div>
                  <span className="font-medium">Validada por:</span> {toma.auditoria_validada_por}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {(toma.observaciones_generales || toma.ubicacion_gps || toma.pdf_url) && (
        <Card>
          <CardContent className="space-y-3 p-6">
            <h2 className="font-display text-lg">Adicional</h2>
            {toma.observaciones_generales && (
              <div className="space-y-1 text-sm">
                <div className="flex items-center gap-1.5 text-xs uppercase text-muted-foreground">
                  <FileText className="h-3.5 w-3.5" />
                  Observaciones generales
                </div>
                <p className="whitespace-pre-line">{toma.observaciones_generales}</p>
              </div>
            )}
            {toma.ubicacion_gps && (
              <div className="space-y-1 text-sm">
                <div className="flex items-center gap-1.5 text-xs uppercase text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5" />
                  Ubicación GPS
                </div>
                <p className="font-mono text-xs">{toma.ubicacion_gps}</p>
              </div>
            )}
            {toma.pdf_url && (
              <Button variant="outline" asChild>
                <a href={toma.pdf_url} target="_blank" rel="noopener noreferrer">
                  <FileCheck2 className="mr-1 h-4 w-4" />
                  Ver PDF en Drive
                </a>
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function InfoCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <Card>
      <CardContent className="space-y-1 p-4">
        <div className="flex items-center gap-2 text-xs uppercase text-muted-foreground">
          <Icon className="h-3.5 w-3.5" />
          <span>{label}</span>
        </div>
        <p className="font-medium">{value}</p>
      </CardContent>
    </Card>
  );
}

function SignatureBlock({
  title,
  name,
  cargo,
  dataUrl,
}: {
  title: string;
  name?: string;
  cargo?: string;
  dataUrl?: string;
}) {
  return (
    <div className="rounded-md border bg-muted/10 p-3">
      <p className="text-xs uppercase text-muted-foreground">{title}</p>
      <div className="mt-1">
        <p className="text-sm font-medium">{name ?? "—"}</p>
        {cargo && <p className="text-xs text-muted-foreground">{cargo}</p>}
      </div>
      {dataUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={dataUrl}
          alt={`Firma de ${name ?? title}`}
          className="mt-2 max-h-32 rounded bg-white"
        />
      ) : (
        <p className="mt-2 text-xs italic text-muted-foreground">Sin firma capturada.</p>
      )}
    </div>
  );
}

