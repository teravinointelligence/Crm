// Detalle de una consignación (read-only). Acceso: admin siempre, vendedor solo
// si la consignación es suya (match por email → vendedor_id en Base44).

import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowLeft, Wine, Truck, User as UserIcon, Calendar, FileText, ClipboardList, Package, PackageX, FileDown, Plus } from "lucide-react";
import { AgregarProductoDialog } from "@/components/consignaciones/AgregarProductoDialog";
import { requireRep } from "@/lib/auth";
import { canAccessFacturacion } from "@/lib/modules";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  base44,
  resolveBase44Vendedor,
  type Base44Cliente,
  type Base44Consignacion,
  type Base44TomaInventario,
  type Base44RetiroConsignacion,
  type Base44Producto,
} from "@/lib/base44";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConsignacionActions } from "@/components/consignaciones/ConsignacionActions";
import { AplicarRetiroButton } from "@/components/consignaciones/AplicarRetiroButton";
import { formatCurrency, formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

const ESTADO_LABEL: Record<Base44Consignacion["estado"], string> = {
  pendiente: "Pendiente",
  parcial: "Parcial",
  liquidada: "Liquidada",
  devuelta: "Devuelta",
};

const ESTADO_VARIANT: Record<Base44Consignacion["estado"], "default" | "outline" | "accent" | "success" | "warning" | "danger" | "muted"> = {
  pendiente: "warning",
  parcial: "accent",
  liquidada: "success",
  devuelta: "danger",
};

export default async function ConsignacionDetailPage({ params }: { params: { id: string } }) {
  const rep = await requireRep();
  const isAdmin = canAccessFacturacion(rep.role);

  let consignacion: Base44Consignacion;
  try {
    consignacion = await base44.entity<Base44Consignacion>("Consignacion").get(params.id);
  } catch {
    notFound();
  }

  // Scope: si no es admin, la consignación debe ser de su vendedor.
  if (!isAdmin) {
    const v = await resolveBase44Vendedor(rep.email);
    if (!v || v.id !== consignacion.vendedor_id) {
      notFound();
    }
  }

  // Cliente Base44 → numero_cliente → CRM account
  let cliente: Base44Cliente | null = null;
  try {
    cliente = await base44.entity<Base44Cliente>("Cliente").get(consignacion.cliente_id);
  } catch {
    cliente = null;
  }

  const supabase = isAdmin ? supabaseAdmin() : createClient();
  let crmAccount: { id: string; business_name: string } | null = null;
  if (cliente?.numero_cliente) {
    const { data } = await supabase
      .from("accounts")
      .select("id, business_name")
      .eq("client_number", cliente.numero_cliente)
      .maybeSingle();
    if (data) crmAccount = data;
  }

  const saldo = (consignacion.total ?? 0) - (consignacion.monto_cobrado ?? 0);
  const items = consignacion.items ?? [];
  const totalCantidad = items.reduce((s, i) => s + (Number(i.cantidad) || 0), 0);

  // Unidades aún en el piso del cliente = consignadas − vendidas − devueltas.
  // Misma fórmula que valida computeMovimiento al registrar movimientos.
  const vendidas = Number(consignacion.cantidad_vendida ?? 0);
  const devueltas = Number(consignacion.cantidad_devuelta ?? 0);
  const pendientesPiso = Math.max(0, totalCantidad - vendidas - devueltas);

  // Tomas de inventario vinculadas a esta consignación.
  let tomas: Base44TomaInventario[] = [];
  try {
    tomas = await base44.entity<Base44TomaInventario>("TomaInventario").list({
      q: { consignacion_id: consignacion.id },
      sort_by: "-fecha_toma",
      limit: 50,
    });
  } catch {
    // Si falla, dejamos la lista vacía; el resto de la página sigue.
  }

  // Retiros de esta consignación.
  let retiros: Base44RetiroConsignacion[] = [];
  try {
    retiros = await base44.entity<Base44RetiroConsignacion>("RetiroConsignacion").list({
      q: { consignacion_id: consignacion.id },
      sort_by: "-fecha",
      limit: 50,
    });
  } catch {
    // sin retiros
  }

  // Catálogo de productos Base44 para el dialog "Agregar producto".
  let catalogoProductos: Base44Producto[] = [];
  try {
    catalogoProductos = await base44.entity<Base44Producto>("Producto").list({ limit: 500 });
  } catch {
    // Si falla, el botón igual aparece pero sin sugerencias de autocompletado.
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/consignaciones">
            <ArrowLeft className="h-4 w-4" />
            <span className="ml-1">Volver</span>
          </Link>
        </Button>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl">
            {consignacion.cliente_nombre ?? "Consignación"}
          </h1>
          <p className="text-sm text-muted-foreground">
            Folio interno Base44: <code className="text-xs">{consignacion.id}</code>
          </p>
        </div>
        <Badge variant={ESTADO_VARIANT[consignacion.estado]} className="text-sm">
          {ESTADO_LABEL[consignacion.estado]}
        </Badge>
      </div>

      <ConsignacionActions consignacion={consignacion} totalCantidad={totalCantidad} />

      {/* Botón generar contrato — visible solo si hay cuenta CRM vinculada */}
      {crmAccount && (
        <div className="flex justify-end">
          <Button asChild variant="outline" size="sm">
            <Link
              href={`/documentos/nuevo?account=${crmAccount.id}&consignacion=${consignacion.id}`}
            >
              <FileText className="mr-1.5 h-4 w-4" />
              Generar contrato de consignación
            </Link>
          </Button>
        </div>
      )}

      {/* Advertencia no bloqueante: hay actividad (retiros o movimientos) pero
          nadie asignó chofer. No impide operar — solo lo hace visible. */}
      {!consignacion.chofer_id &&
        (retiros.length > 0 || vendidas > 0 || devueltas > 0 || Number(consignacion.monto_cobrado ?? 0) > 0) && (
          <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              Esta consignación ya tiene{" "}
              {retiros.length > 0 ? "retiros registrados" : "movimientos registrados"} pero{" "}
              <strong>no tiene chofer asignado</strong>. Usa “Asignar chofer” arriba para
              dejar el dato completo.
            </p>
          </div>
        )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <InfoCard icon={Calendar} label="Fecha" value={formatDate(consignacion.fecha)} />
        <InfoCard icon={UserIcon} label="Vendedor" value={consignacion.vendedor_nombre ?? "—"} />
        <InfoCard icon={Truck} label="Chofer" value={consignacion.chofer_nombre ?? "Sin asignar"} />
        <Card>
          <CardContent className="space-y-1 p-4">
            <div className="flex items-center gap-2 text-xs uppercase text-muted-foreground">
              <Package className="h-3.5 w-3.5" />
              <span>Pendientes en piso</span>
            </div>
            {totalCantidad > 0 ? (
              <p className="font-display text-2xl text-brand-carmesi">
                {pendientesPiso}{" "}
                <span className="font-sans text-sm font-normal text-muted-foreground">
                  de {totalCantidad} unidades
                </span>
              </p>
            ) : (
              <p className="font-medium text-muted-foreground">Sin items cargados</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="space-y-3 p-6">
          <h2 className="font-display text-lg">Cliente</h2>
          <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
            <div>
              <p className="text-xs uppercase text-muted-foreground">Nombre comercial</p>
              <p>{cliente?.nombre ?? consignacion.cliente_nombre ?? "—"}</p>
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
            <div className="pt-2">
              <Button variant="outline" size="sm" asChild>
                <Link href={`/cuentas/${crmAccount.id}`}>
                  Ver ficha en el CRM →
                </Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="flex items-center justify-between border-b p-4">
            <h2 className="font-display text-lg">Productos consignados</h2>
            <AgregarProductoDialog
              consignacionId={consignacion.id}
              productos={catalogoProductos}
              etiquetasActuales={totalCantidad}
            />
          </div>
          {items.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              Esta consignación no tiene items cargados.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 text-left">Producto</th>
                    <th className="px-4 py-2 text-right">Cantidad</th>
                    <th className="px-4 py-2 text-right">Precio unit.</th>
                    <th className="px-4 py-2 text-right">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, i) => (
                    <tr key={`${it.producto_id}-${i}`} className="border-t">
                      <td className="px-4 py-2">{it.producto_nombre}</td>
                      <td className="px-4 py-2 text-right">{it.cantidad}</td>
                      <td className="px-4 py-2 text-right">{formatCurrency(it.precio_unitario)}</td>
                      <td className="px-4 py-2 text-right">{formatCurrency(it.subtotal)}</td>
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
          <div className="flex items-center justify-between border-b p-4">
            <div className="flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-muted-foreground" />
              <h2 className="font-display text-lg">Tomas de inventario</h2>
              <span className="text-xs text-muted-foreground">({tomas.length})</span>
            </div>
            <Button asChild size="sm">
              <Link href={`/consignaciones/tomas/nueva?consignacion=${consignacion.id}`}>
                <Plus className="mr-1 h-4 w-4" /> Nueva toma
              </Link>
            </Button>
          </div>
          {tomas.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              Aún no se han registrado tomas de inventario para esta consignación.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 text-left">Folio</th>
                    <th className="px-4 py-2 text-left">Fecha</th>
                    <th className="px-4 py-2 text-right">Botellas</th>
                    <th className="px-4 py-2 text-right">Etiquetas</th>
                    <th className="px-4 py-2 text-left">Estado</th>
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
                      <td className="px-4 py-2 whitespace-nowrap">{formatDate(t.fecha_toma)}</td>
                      <td className="px-4 py-2 text-right">{t.total_botellas ?? 0}</td>
                      <td className="px-4 py-2 text-right">{t.total_etiquetas ?? 0}</td>
                      <td className="px-4 py-2 text-xs">{t.estado}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Retiros de consignación */}
      <Card>
        <CardContent className="p-0">
          <div className="flex items-center gap-2 border-b p-4">
            <PackageX className="h-4 w-4 text-muted-foreground" />
            <h2 className="font-display text-lg">Retiros</h2>
            <span className="text-xs text-muted-foreground">({retiros.length})</span>
          </div>
          {retiros.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              Sin retiros registrados. Usa “Retiro de consignación” arriba para registrar productos que el cliente devuelve.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 text-left">Folio</th>
                    <th className="px-4 py-2 text-left">Fecha</th>
                    <th className="px-4 py-2 text-right">Unidades</th>
                    <th className="px-4 py-2 text-left">Estado</th>
                    <th className="px-4 py-2 text-left">Inventario</th>
                    <th className="px-4 py-2 text-right">PDF</th>
                  </tr>
                </thead>
                <tbody>
                  {retiros.map((r) => {
                    const aplicado =
                      r.estado === "recogido" ||
                      !!consignacion.notas?.includes(`Retiro ${r.numero_retiro ?? r.id.slice(0, 8)} aplicado`);
                    const aplicable = !aplicado && r.estado !== "cancelado";
                    return (
                    <tr key={r.id} className="border-t hover:bg-muted/20">
                      <td className="px-4 py-2 whitespace-nowrap font-medium">{r.numero_retiro ?? r.id.slice(0, 8)}</td>
                      <td className="px-4 py-2 whitespace-nowrap">{formatDate(r.fecha)}</td>
                      <td className="px-4 py-2 text-right">{r.total_unidades ?? 0}</td>
                      <td className="px-4 py-2 text-xs">{r.estado}</td>
                      <td className="px-4 py-2">
                        {aplicado ? (
                          <span className="inline-flex items-center text-xs text-emerald-700">Aplicado ✓</span>
                        ) : aplicable ? (
                          <AplicarRetiroButton
                            retiroId={r.id}
                            folio={r.numero_retiro ?? r.id.slice(0, 8)}
                            unidades={Number(r.total_unidades ?? 0)}
                          />
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <a
                          href={`/api/consignaciones/retiros/${r.id}/pdf`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center text-brand-carmesi hover:underline"
                        >
                          <FileDown className="mr-1 h-3.5 w-3.5" /> PDF
                        </a>
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

      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <InfoCard icon={Wine} label="Total" value={formatCurrency(consignacion.total)} />
        <InfoCard icon={Wine} label="Unidades vendidas" value={String(consignacion.cantidad_vendida ?? 0)} />
        <InfoCard icon={Wine} label="Unidades devueltas" value={String(consignacion.cantidad_devuelta ?? 0)} />
        <InfoCard icon={Wine} label="Monto cobrado" value={formatCurrency(consignacion.monto_cobrado)} />
      </div>

      <Card>
        <CardContent className="flex items-center justify-between p-6">
          <div>
            <p className="text-xs uppercase text-muted-foreground">Saldo abierto</p>
            <p className="font-display text-3xl text-brand-carmesi">{formatCurrency(saldo)}</p>
          </div>
          <Badge variant={ESTADO_VARIANT[consignacion.estado]}>
            {ESTADO_LABEL[consignacion.estado]}
          </Badge>
        </CardContent>
      </Card>

      {consignacion.notas && (
        <Card>
          <CardContent className="space-y-2 p-6">
            <div className="flex items-center gap-2 text-sm font-medium">
              <FileText className="h-4 w-4" />
              <span>Notas</span>
            </div>
            <p className="text-sm text-muted-foreground whitespace-pre-line">{consignacion.notas}</p>
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
