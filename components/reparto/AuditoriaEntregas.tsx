// Tarjeta de auditoría: pedidos que siguen marcados como pendientes de entrega
// porque nadie subió la foto de la factura firmada y sellada. Se usa en el
// Dashboard de Reparto (versión corta) y en /reparto/auditoria (completa).
// Server component puro: los recordatorios son enlaces wa.me, sin JS de cliente.

import Link from "next/link";
import { AlertTriangle, Camera, CheckCircle2, MessageCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ESTATUS_LABEL, ESTATUS_VARIANT } from "@/types/reparto";
import { formatCurrency } from "@/lib/utils";
import { DIAS_CRITICO, linkWhatsapp, mensajeRecordatorio, telefonoChofer } from "@/lib/reparto-auditoria";
import type { AuditoriaEntregas as AuditoriaData } from "@/lib/reparto-auditoria-data";

export function AuditoriaEntregas({
  data,
  limite,
  verTodosHref,
  mostrarMontos = true,
}: {
  data: AuditoriaData;
  /** Cuántas filas mostrar (el resto se resume en el pie). */
  limite?: number;
  /** Si se pasa, se agrega el botón "Ver auditoría completa". */
  verTodosHref?: string;
  /** Los choferes no ven montos de facturación. */
  mostrarMontos?: boolean;
}) {
  const { pendientes, resumen } = data;
  const visibles = limite ? pendientes.slice(0, limite) : pendientes;
  const restantes = pendientes.length - visibles.length;

  return (
    <Card className={resumen.criticos > 0 ? "border-red-300" : undefined}>
      <CardContent className="p-0">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b px-4 py-3">
          <div>
            <h3 className="flex items-center gap-2 font-display text-lg">
              <Camera className="h-4 w-4 text-brand-carmesi" />
              Auditoría de entregas sin evidencia
            </h3>
            <p className="text-xs text-muted-foreground">
              Pedidos de días anteriores que siguen como pendientes de entrega porque no se ha
              subido la foto de la factura con firma y sello.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {resumen.total > 0 && (
              <Badge variant={resumen.criticos > 0 ? "danger" : "warning"}>
                {resumen.total} pendiente{resumen.total === 1 ? "" : "s"}
              </Badge>
            )}
            {verTodosHref && (
              <Button asChild size="sm" variant="ghost">
                <Link href={verTodosHref}>Ver auditoría</Link>
              </Button>
            )}
          </div>
        </div>

        {pendientes.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-8 text-center text-muted-foreground">
            <CheckCircle2 className="h-6 w-6 text-emerald-600" />
            <p className="text-sm">
              Sin pedidos atorados: todas las entregas de días anteriores tienen su evidencia.
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2">Folio</th>
                    <th className="px-4 py-2">Cliente</th>
                    <th className="px-4 py-2">Chofer</th>
                    <th className="px-4 py-2">Fecha</th>
                    <th className="px-4 py-2 text-right">Días sin evidencia</th>
                    <th className="px-4 py-2">Estatus</th>
                    {mostrarMontos && <th className="px-4 py-2 text-right">Total</th>}
                    <th className="px-4 py-2 text-right">Recordar</th>
                  </tr>
                </thead>
                <tbody>
                  {visibles.map((p) => {
                    const tel = p.chofer ? telefonoChofer(p.chofer.nombre, p.chofer.telefono) : null;
                    const wa = p.chofer
                      ? linkWhatsapp(
                          tel,
                          mensajeRecordatorio(p.chofer.nombre, [
                            {
                              numero_factura: p.numero_factura,
                              fecha: p.fecha,
                              dias: p.dias,
                              cliente: p.cliente?.nombre ?? null,
                            },
                          ]),
                        )
                      : null;
                    return (
                      <tr key={p.id} className="border-b last:border-b-0 hover:bg-muted/30">
                        <td className="px-4 py-2 font-medium">
                          <Link href={`/reparto/pedidos/${p.id}`} className="hover:text-brand-carmesi">
                            {p.numero_factura}
                          </Link>
                        </td>
                        <td className="px-4 py-2">
                          {p.cliente?.nombre ?? "—"}
                          {p.cliente?.ciudad && (
                            <div className="text-xs text-muted-foreground">{p.cliente.ciudad}</div>
                          )}
                        </td>
                        <td className="px-4 py-2 text-muted-foreground">
                          {p.chofer?.nombre ?? <span className="text-amber-700">sin asignar</span>}
                        </td>
                        <td className="px-4 py-2 text-xs text-muted-foreground">{p.fecha}</td>
                        <td className="px-4 py-2 text-right">
                          <span
                            className={
                              p.severidad === "critico"
                                ? "font-semibold text-red-700"
                                : "font-medium text-amber-700"
                            }
                          >
                            {p.dias} día{p.dias === 1 ? "" : "s"}
                          </span>
                        </td>
                        <td className="px-4 py-2">
                          <Badge variant={ESTATUS_VARIANT[p.estatus]}>{ESTATUS_LABEL[p.estatus]}</Badge>
                        </td>
                        {mostrarMontos && (
                          <td className="px-4 py-2 text-right">{formatCurrency(p.total)}</td>
                        )}
                        <td className="px-4 py-2 text-right">
                          {wa ? (
                            <Button asChild size="sm" variant="outline">
                              <a href={wa} target="_blank" rel="noreferrer">
                                <MessageCircle className="mr-1 h-3.5 w-3.5" /> WhatsApp
                              </a>
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              {p.chofer ? "sin teléfono" : "—"}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-3 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                {resumen.criticos} con {DIAS_CRITICO} días o más · atraso máximo {resumen.diasMax} días
                {mostrarMontos && resumen.montoDetenido > 0 && (
                  <> · {formatCurrency(resumen.montoDetenido)} detenidos</>
                )}
              </span>
              {restantes > 0 && verTodosHref && (
                <Link href={verTodosHref} className="text-brand-carmesi hover:underline">
                  +{restantes} más en la auditoría completa
                </Link>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
