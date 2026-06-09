// Detalle de un vehículo de la flota: datos del auto + seguro + servicios.
// Muestra qué datos faltan y formularios para completar todo. Guardar escribe
// de vuelta en el app Base44 "Teravino Flota".

import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getCurrentRep } from "@/lib/auth";
import { canAccessFlota } from "@/lib/modules";
import {
  base44Flota,
  missingFields,
  type FlotaVehicle,
  type FlotaInsurancePolicy,
  type FlotaMechanicalService,
} from "@/lib/base44-flota";
import { VehicleForm } from "@/components/flota/VehicleForm";
import { InsuranceSection } from "@/components/flota/InsuranceSection";
import { ServicesSection } from "@/components/flota/ServicesSection";

export const metadata = { title: "Vehículo — Flota — TERAVINO CRM" };
export const dynamic = "force-dynamic";

export default async function VehicleDetailPage({ params }: { params: { id: string } }) {
  const rep = await getCurrentRep();
  if (!rep) redirect("/login");
  if (!canAccessFlota(rep.role)) redirect("/");

  let vehicle: FlotaVehicle | null = null;
  try {
    vehicle = await base44Flota.entity<FlotaVehicle>("Vehicle").get(params.id);
  } catch {
    vehicle = null;
  }
  if (!vehicle) notFound();

  // Seguro y servicios del vehículo (no crítico: si fallan, mostramos vacío).
  let policies: FlotaInsurancePolicy[] = [];
  let services: FlotaMechanicalService[] = [];
  try {
    [policies, services] = await Promise.all([
      base44Flota
        .entity<FlotaInsurancePolicy>("InsurancePolicy")
        .list({ q: { vehicle_id: params.id }, sort_by: "-end_date", limit: 50 }),
      base44Flota
        .entity<FlotaMechanicalService>("MechanicalService")
        .list({ q: { vehicle_id: params.id }, sort_by: "-date", limit: 100 }),
    ]);
  } catch {
    // ignoramos: las secciones aparecen vacías y se pueden alta de todas formas.
  }

  const missing = missingFields(vehicle);

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/flota"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver a la flota
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="font-display text-3xl">
            {vehicle.brand} {vehicle.model}
          </h1>
          {missing.length > 0 ? (
            <Badge variant="warning">
              <AlertTriangle className="mr-1 h-3.5 w-3.5" />
              {missing.length} dato{missing.length === 1 ? "" : "s"} por completar
            </Badge>
          ) : (
            <Badge variant="success">
              <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
              Datos completos
            </Badge>
          )}
        </div>
        {missing.length > 0 ? (
          <p className="mt-1 text-sm text-amber-600">Falta: {missing.join(", ")}.</p>
        ) : null}
      </div>

      <VehicleForm vehicle={vehicle} />

      <InsuranceSection vehicleId={vehicle.id} policies={policies} />

      <ServicesSection vehicleId={vehicle.id} services={services} />
    </div>
  );
}
