// Reparto › Auditoría de entregas.
//
// Un pedido solo se cierra como "entregado" cuando el chofer sube la foto de la
// factura con firma y sello. Cuando no la sube, el pedido se queda marcado como
// pendiente de entrega aunque la mercancía ya se haya entregado. Esta pantalla
// lista esos pedidos, los agrupa por chofer y arma el recordatorio de WhatsApp
// (varios choferes no usan correo, así que WhatsApp es el canal real).

import { redirect } from "next/navigation";
import Link from "next/link";
import { Camera, CheckCircle2, MessageCircle } from "lucide-react";
import { getCurrentRep } from "@/lib/auth";
import { canManageReparto, canViewReparto } from "@/lib/modules";
import { loadAuditoriaEntregas } from "@/lib/reparto-auditoria-data";
import { DIAS_CRITICO, linkWhatsapp, mensajeRecordatorio } from "@/lib/reparto-auditoria";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AuditoriaEntregas } from "@/components/reparto/AuditoriaEntregas";
import { formatCurrency } from "@/lib/utils";

export const metadata = { title: "Auditoría de entregas — Reparto" };
export const dynamic = "force-dynamic";

export default async function AuditoriaRepartoPage() {
  const rep = await getCurrentRep();
  if (!rep) redirect("/login");
  if (!canViewReparto(rep.role)) redirect("/");
  const esChofer = rep.role === "chofer";
  const canManage = canManageReparto(rep.role);

  const data = await loadAuditoriaEntregas();
  const { resumen, porChofer, pendientes, entregadosSinFoto } = data;

  // Pedidos por chofer para armar un solo mensaje con todos sus folios.
  const pedidosDeChofer = (choferId: string | null) =>
    pendientes.filter((p) => (p.chofer?.id ?? null) === choferId);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl">Auditoría de entregas</h1>
          <p className="text-sm text-muted-foreground">
            Pedidos que siguen marcados como pendientes de entrega porque falta subir la foto de la
            factura con firma y sello.
          </p>
        </div>
        <Button asChild variant="ghost" size="sm">
          <Link href="/reparto/dashboard">Volver al dashboard</Link>
        </Button>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Sin evidencia" value={String(resumen.total)} tone={resumen.total > 0 ? "warning" : "ok"} />
        <Kpi
          label={`Críticos (${DIAS_CRITICO}+ días)`}
          value={String(resumen.criticos)}
          tone={resumen.criticos > 0 ? "danger" : "ok"}
        />
        <Kpi label="Atraso máximo" value={`${resumen.diasMax} días`} tone={resumen.diasMax > 0 ? "warning" : "ok"} />
        {esChofer ? (
          <Kpi label="En ruta / asignados" value={`${resumen.enRuta} / ${resumen.asignados}`} />
        ) : (
          <Kpi label="Facturación detenida" value={formatCurrency(resumen.montoDetenido)} tone="accent" />
        )}
      </section>

      {porChofer.length > 0 && (
        <section>
          <Card>
            <CardContent className="p-0">
              <div className="border-b px-4 py-3">
                <h3 className="font-display text-lg">A quién hay que recordarle</h3>
                <p className="text-xs text-muted-foreground">
                  Un mensaje por chofer con todos sus folios pendientes. Si el chofer no tiene
                  teléfono en su ficha (Reparto › Choferes), aquí no aparece el botón.
                </p>
              </div>
              <ul className="divide-y">
                {porChofer.map((c) => {
                  const suyos = pedidosDeChofer(c.chofer_id);
                  const wa = linkWhatsapp(
                    c.telefono,
                    mensajeRecordatorio(
                      c.nombre,
                      suyos.map((p) => ({
                        numero_factura: p.numero_factura,
                        fecha: p.fecha,
                        dias: p.dias,
                        cliente: p.cliente?.nombre ?? null,
                      })),
                    ),
                  );
                  return (
                    <li key={c.chofer_id ?? "sin_asignar"} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                      <div>
                        <div className="font-medium">{c.nombre}</div>
                        <div className="text-xs text-muted-foreground">
                          {c.pedidos} pedido{c.pedidos === 1 ? "" : "s"} · atraso máximo {c.diasMax} día
                          {c.diasMax === 1 ? "" : "s"}
                          {c.telefono ? ` · ${c.telefono}` : " · sin teléfono registrado"}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {c.diasMax >= DIAS_CRITICO && <Badge variant="danger">Urgente</Badge>}
                        {wa ? (
                          <Button asChild size="sm" variant="outline">
                            <a href={wa} target="_blank" rel="noreferrer">
                              <MessageCircle className="mr-1 h-3.5 w-3.5" /> Recordar por WhatsApp
                            </a>
                          </Button>
                        ) : c.chofer_id ? (
                          canManage ? (
                            <Button asChild size="sm" variant="ghost">
                              <Link href="/reparto/choferes">Capturar teléfono</Link>
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground">sin teléfono</span>
                          )
                        ) : (
                          <Button asChild size="sm" variant="ghost">
                            <Link href="/reparto/rutas">Asignar chofer</Link>
                          </Button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>
        </section>
      )}

      <section>
        <AuditoriaEntregas data={data} mostrarMontos={!esChofer} />
      </section>

      <section>
        <Card>
          <CardContent className="p-0">
            <div className="border-b px-4 py-3">
              <h3 className="flex items-center gap-2 font-display text-lg">
                <Camera className="h-4 w-4 text-muted-foreground" />
                Entregados sin foto
              </h3>
              <p className="text-xs text-muted-foreground">
                Pedidos cerrados como entregados a mano, sin evidencia en la bitácora (últimos 90
                días).
              </p>
            </div>
            {entregadosSinFoto.length === 0 ? (
              <div className="flex flex-col items-center gap-2 p-8 text-center text-muted-foreground">
                <CheckCircle2 className="h-6 w-6 text-emerald-600" />
                <p className="text-sm">Todos los entregados del periodo tienen su foto.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2">Folio</th>
                      <th className="px-4 py-2">Cliente</th>
                      <th className="px-4 py-2">Chofer</th>
                      <th className="px-4 py-2">Fecha</th>
                      {!esChofer && <th className="px-4 py-2 text-right">Total</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {entregadosSinFoto.map((p) => (
                      <tr key={p.id} className="border-b last:border-b-0 hover:bg-muted/30">
                        <td className="px-4 py-2 font-medium">
                          <Link href={`/reparto/pedidos/${p.id}`} className="hover:text-brand-carmesi">
                            {p.numero_factura}
                          </Link>
                        </td>
                        <td className="px-4 py-2">{p.cliente?.nombre ?? "—"}</td>
                        <td className="px-4 py-2 text-muted-foreground">{p.chofer?.nombre ?? "—"}</td>
                        <td className="px-4 py-2 text-xs text-muted-foreground">{p.fecha}</td>
                        {!esChofer && <td className="px-4 py-2 text-right">{formatCurrency(p.total)}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function Kpi({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "accent" | "warning" | "ok" | "danger";
}) {
  const cls =
    tone === "danger"
      ? "text-red-700"
      : tone === "warning"
        ? "text-amber-700"
        : tone === "ok"
          ? "text-emerald-700"
          : "text-brand-carmesi";
  return (
    <Card>
      <CardContent className="space-y-1 p-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className={`font-display text-2xl ${cls}`}>{value}</p>
      </CardContent>
    </Card>
  );
}
