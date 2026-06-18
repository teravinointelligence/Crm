// Flota: parque vehicular de TERAVINO (app Base44 "Teravino Flota").
// Logística (admin + jefe de logística) ve todos los vehículos y completa los
// datos faltantes de cada auto entrando a su detalle.

import { redirect } from "next/navigation";
import Link from "next/link";
import { Car, AlertTriangle, CheckCircle2, Plus, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { getCurrentRep } from "@/lib/auth";
import { canAccessFlota } from "@/lib/modules";
import { formatCurrency } from "@/lib/utils";
import { base44Flota, missingFields, type FlotaVehicle } from "@/lib/base44-flota";

export const metadata = { title: "Flota — TERAVINO CRM" };
export const dynamic = "force-dynamic";

export default async function FlotaPage() {
  const rep = await getCurrentRep();
  if (!rep) redirect("/login");
  if (!canAccessFlota(rep.role)) redirect("/");

  let vehicles: FlotaVehicle[] = [];
  let loadError: string | null = null;
  try {
    vehicles = await base44Flota
      .entity<FlotaVehicle>("Vehicle")
      .list({ sort_by: "brand", limit: 500 });
  } catch (e) {
    loadError = e instanceof Error ? e.message : String(e);
  }

  const notConfigured = loadError?.includes("BASE44");
  const incompletos = vehicles.filter((v) => missingFields(v).length > 0).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl">Flota</h1>
          <p className="text-sm text-muted-foreground">
            Parque vehicular de TERAVINO. Entra a cada auto para completar los datos que faltan.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href="/flota/fallas">
              <Wrench className="mr-1 h-4 w-4" />
              Fallas de vehículos
            </Link>
          </Button>
          <Button asChild>
            <Link href="/flota/nuevo">
              <Plus className="mr-1 h-4 w-4" />
              Nuevo vehículo
            </Link>
          </Button>
        </div>
      </div>

      {loadError ? (
        <EmptyState
          icon={Car}
          title={notConfigured ? "Falta conectar Teravino Flota" : "No pudimos cargar la flota"}
          description={
            notConfigured
              ? "Configura BASE44_FLOTA_API_KEY (o BASE44_API_KEY) en Vercel → Settings → Environment Variables para enlazar el app de Base44."
              : loadError ?? undefined
          }
        />
      ) : vehicles.length === 0 ? (
        <EmptyState icon={Car} title="Sin vehículos" description="Aún no hay autos registrados en la flota." />
      ) : (
        <>
          <div className="flex flex-wrap gap-3 text-sm">
            <Badge variant="muted">{vehicles.length} vehículos</Badge>
            {incompletos > 0 ? (
              <Badge variant="warning">
                <AlertTriangle className="mr-1 h-3.5 w-3.5" />
                {incompletos} con datos pendientes
              </Badge>
            ) : (
              <Badge variant="success">
                <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                Todos completos
              </Badge>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {vehicles.map((v) => {
              const missing = missingFields(v);
              return (
                <Link key={v.id} href={`/flota/${v.id}`} className="block">
                  <Card className="h-full transition-colors hover:border-brand-carmesi/50">
                    <CardContent className="space-y-2 p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h3 className="font-display text-base leading-tight">
                            {v.brand} {v.model}
                          </h3>
                          <p className="text-xs text-muted-foreground">
                            {v.year}
                            {v.version ? ` · ${v.version}` : ""}
                            {v.location ? ` · ${v.location}` : ""}
                          </p>
                        </div>
                        {missing.length > 0 ? (
                          <Badge variant="warning">{missing.length} faltan</Badge>
                        ) : (
                          <Badge variant="success">Completo</Badge>
                        )}
                      </div>
                      <dl className="space-y-0.5 text-xs">
                        <div className="flex justify-between gap-2">
                          <dt className="text-muted-foreground">Placas</dt>
                          <dd className={v.plates ? "" : "text-amber-600"}>{v.plates ?? "—"}</dd>
                        </div>
                        <div className="flex justify-between gap-2">
                          <dt className="text-muted-foreground">Conductor</dt>
                          <dd className={v.assigned_driver ? "" : "text-amber-600"}>
                            {v.assigned_driver ?? "—"}
                          </dd>
                        </div>
                        <div className="flex justify-between gap-2">
                          <dt className="text-muted-foreground">Valor est.</dt>
                          <dd>{v.estimated_value != null ? formatCurrency(v.estimated_value) : "—"}</dd>
                        </div>
                      </dl>
                      {missing.length > 0 ? (
                        <p className="line-clamp-1 text-[11px] text-amber-600">
                          Falta: {missing.join(", ")}
                        </p>
                      ) : null}
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
