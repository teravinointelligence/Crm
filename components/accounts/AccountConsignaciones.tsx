// Sección de consignaciones + tomas de inventario para mostrar en la ficha
// de cuenta (`/cuentas/[id]`). Server component que cruza el `client_number`
// (CONTPAQ i) del account con la entidad `Cliente` de Base44, y luego carga
// consignaciones y tomas relacionadas.
//
// Scope: admin ve todo. Rep ve solo los registros donde él es el vendedor en
// Base44 (match por email). Si el rep accede a un account propio donde algún
// otro vendedor creó la consignación, no aparece — el rep ya tiene su propia
// vista en /consignaciones, y la ficha respeta el mismo principio.

import Link from "next/link";
import { HandCoins, ClipboardList, ExternalLink } from "lucide-react";
import {
  base44,
  resolveBase44Vendedor,
  type Base44Cliente,
  type Base44Consignacion,
  type Base44TomaInventario,
} from "@/lib/base44";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/utils";

type Props = {
  clientNumber: string | null;
  isAdmin: boolean;
  repEmail: string;
};

const CONS_ESTADO_LABEL: Record<Base44Consignacion["estado"], string> = {
  pendiente: "Pendiente",
  parcial: "Parcial",
  liquidada: "Liquidada",
  devuelta: "Devuelta",
};
const CONS_ESTADO_VARIANT: Record<
  Base44Consignacion["estado"],
  "default" | "outline" | "accent" | "success" | "warning" | "danger" | "muted"
> = {
  pendiente: "warning",
  parcial: "accent",
  liquidada: "success",
  devuelta: "danger",
};

const TOMA_ESTADO_LABEL: Record<Base44TomaInventario["estado"], string> = {
  borrador: "Borrador",
  firmado: "Firmado",
  sincronizado_drive: "En Drive",
  anulado: "Anulado",
};
const TOMA_ESTADO_VARIANT: Record<
  Base44TomaInventario["estado"],
  "default" | "outline" | "accent" | "success" | "warning" | "danger" | "muted"
> = {
  borrador: "muted",
  firmado: "accent",
  sincronizado_drive: "success",
  anulado: "danger",
};

export async function AccountConsignaciones({ clientNumber, isAdmin, repEmail }: Props) {
  if (!clientNumber) {
    return (
      <EmptyState
        icon={HandCoins}
        title="Cuenta sin # cliente CONTPAQ i"
        description="Esta cuenta no tiene número de cliente CONTPAQ i asignado, así que no se puede cruzar con TERAVINO Flow. Asígnale uno desde Cuentas → Sincronizar # cliente."
      />
    );
  }

  // Buscar el Cliente de Base44 por numero_cliente.
  let cliente: Base44Cliente | null = null;
  let loadError: string | null = null;
  try {
    const matches = await base44
      .entity<Base44Cliente>("Cliente")
      .list({ q: { numero_cliente: clientNumber }, limit: 1 });
    cliente = matches[0] ?? null;
  } catch (e) {
    loadError = e instanceof Error ? e.message : String(e);
  }

  if (loadError) {
    return (
      <EmptyState
        icon={HandCoins}
        title="No pudimos cargar TERAVINO Flow"
        description={
          loadError.includes("BASE44_API_KEY")
            ? "Falta configurar BASE44_API_KEY en Vercel."
            : loadError
        }
      />
    );
  }

  if (!cliente) {
    return (
      <EmptyState
        icon={HandCoins}
        title="Esta cuenta no está en TERAVINO Flow"
        description={`No encontré un Cliente con numero_cliente="${clientNumber}" en Base44. Si el cliente debería tener consignaciones, agrégalo en TERAVINO Flow.`}
      />
    );
  }

  // Scope por vendedor para no-admin.
  let scopeVendedorId: string | null = null;
  if (!isAdmin) {
    const v = await resolveBase44Vendedor(repEmail);
    if (v) scopeVendedorId = v.id;
    // Si el rep no tiene match, scopeVendedorId queda null y filtramos abajo a "nada".
  }

  const consQuery: Record<string, unknown> = { cliente_id: cliente.id };
  const tomaQuery: Record<string, unknown> = { cliente_id: cliente.id };
  if (!isAdmin) {
    // Para reps sin match en Base44, devolvemos un id imposible para no traer nada.
    const vid = scopeVendedorId ?? "__no_match__";
    consQuery.vendedor_id = vid;
    tomaQuery.vendedor_id = vid;
  }

  const [consignaciones, tomas] = await Promise.all([
    base44.entity<Base44Consignacion>("Consignacion").list({
      q: consQuery,
      sort_by: "-fecha",
      limit: 50,
    }),
    base44.entity<Base44TomaInventario>("TomaInventario").list({
      q: tomaQuery,
      sort_by: "-fecha_toma",
      limit: 50,
    }),
  ]);

  const consAbiertas = consignaciones.filter(
    (c) => c.estado === "pendiente" || c.estado === "parcial",
  );
  const saldoAbierto = consAbiertas.reduce(
    (s, c) => s + ((c.total ?? 0) - (c.monto_cobrado ?? 0)),
    0,
  );

  return (
    <div className="space-y-6">
      {/* Resumen */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="Consignaciones" value={String(consignaciones.length)} />
        <StatCard label="Abiertas" value={String(consAbiertas.length)} />
        <StatCard label="Saldo abierto" value={formatCurrency(saldoAbierto)} highlight={saldoAbierto > 0} />
      </div>

      {/* Consignaciones */}
      <Card>
        <CardContent className="space-y-3 p-6">
          <div className="flex items-center gap-2">
            <HandCoins className="h-4 w-4 text-muted-foreground" />
            <h3 className="font-display text-lg">Consignaciones</h3>
            <span className="text-xs text-muted-foreground">({consignaciones.length})</span>
          </div>
          {consignaciones.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {isAdmin
                ? "Sin consignaciones registradas para este cliente."
                : "No tienes consignaciones activas con este cliente."}
            </p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">Fecha</th>
                    {isAdmin && <th className="px-3 py-2 text-left">Vendedor</th>}
                    <th className="px-3 py-2 text-right">Total</th>
                    <th className="px-3 py-2 text-right">Saldo</th>
                    <th className="px-3 py-2 text-left">Estado</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  {consignaciones.slice(0, 10).map((c) => {
                    const saldo = (c.total ?? 0) - (c.monto_cobrado ?? 0);
                    return (
                      <tr key={c.id} className="border-t hover:bg-muted/20">
                        <td className="px-3 py-2 whitespace-nowrap">
                          <Link href={`/consignaciones/${c.id}`} className="text-brand-carmesi hover:underline">
                            {formatDate(c.fecha)}
                          </Link>
                        </td>
                        {isAdmin && <td className="px-3 py-2">{c.vendedor_nombre ?? "—"}</td>}
                        <td className="px-3 py-2 text-right whitespace-nowrap">{formatCurrency(c.total)}</td>
                        <td className="px-3 py-2 text-right whitespace-nowrap font-medium">{formatCurrency(saldo)}</td>
                        <td className="px-3 py-2">
                          <Badge variant={CONS_ESTADO_VARIANT[c.estado]}>{CONS_ESTADO_LABEL[c.estado]}</Badge>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Link
                            href={`/consignaciones/${c.id}`}
                            className="inline-flex items-center text-muted-foreground hover:text-foreground"
                            aria-label="Abrir"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {consignaciones.length > 10 && (
            <p className="text-xs text-muted-foreground">
              Mostrando 10 de {consignaciones.length}. <Link href="/consignaciones" className="hover:underline">Ver todas →</Link>
            </p>
          )}
        </CardContent>
      </Card>

      {/* Tomas de inventario */}
      <Card>
        <CardContent className="space-y-3 p-6">
          <div className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-muted-foreground" />
            <h3 className="font-display text-lg">Tomas de inventario</h3>
            <span className="text-xs text-muted-foreground">({tomas.length})</span>
          </div>
          {tomas.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {isAdmin
                ? "Sin tomas de inventario para este cliente."
                : "No tienes tomas registradas con este cliente."}
            </p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">Folio</th>
                    <th className="px-3 py-2 text-left">Fecha</th>
                    {isAdmin && <th className="px-3 py-2 text-left">Vendedor</th>}
                    <th className="px-3 py-2 text-right">Botellas</th>
                    <th className="px-3 py-2 text-left">Estado</th>
                    <th className="px-3 py-2 text-left">Auditoría</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  {tomas.slice(0, 10).map((t) => (
                    <tr key={t.id} className="border-t hover:bg-muted/20">
                      <td className="px-3 py-2 whitespace-nowrap">
                        <Link
                          href={`/consignaciones/tomas/${t.id}`}
                          className="text-brand-carmesi hover:underline"
                        >
                          {t.numero_toma ?? t.id.slice(0, 8)}
                        </Link>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">{formatDateTime(t.fecha_toma)}</td>
                      {isAdmin && <td className="px-3 py-2">{t.vendedor_nombre ?? "—"}</td>}
                      <td className="px-3 py-2 text-right">{t.total_botellas ?? 0}</td>
                      <td className="px-3 py-2">
                        <Badge variant={TOMA_ESTADO_VARIANT[t.estado]}>{TOMA_ESTADO_LABEL[t.estado]}</Badge>
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {t.auditoria_resultado ?? "—"}
                        {typeof t.auditoria_score === "number" ? ` (${t.auditoria_score})` : ""}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Link
                          href={`/consignaciones/tomas/${t.id}`}
                          className="inline-flex items-center text-muted-foreground hover:text-foreground"
                          aria-label="Abrir"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {tomas.length > 10 && (
            <p className="text-xs text-muted-foreground">
              Mostrando 10 de {tomas.length}. <Link href="/consignaciones/tomas" className="hover:underline">Ver todas →</Link>
            </p>
          )}
        </CardContent>
      </Card>
    </div>
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
        <p className={highlight ? "font-display text-2xl text-brand-carmesi" : "font-display text-2xl"}>
          {value}
        </p>
      </CardContent>
    </Card>
  );
}

