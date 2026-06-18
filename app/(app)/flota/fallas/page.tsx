// Reporte de fallas de vehículos. Accesible a CHOFERES (reportan y ven las
// suyas) y a logística (admin + jefe, ven todas y cambian el estatus). Los
// vehículos vienen de Base44 (best-effort); las fallas viven en Supabase.

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRep } from "@/lib/auth";
import { canReportFleetFault, canManageFleetFaults } from "@/lib/modules";
import { base44Flota, type FlotaVehicle } from "@/lib/base44-flota";
import { FaultReports } from "@/components/flota/FaultReports";
import type { FaultReport } from "@/lib/flota-faults";

export const metadata = { title: "Fallas de vehículos — TERAVINO CRM" };
export const dynamic = "force-dynamic";

export default async function FlotaFallasPage() {
  const rep = await getCurrentRep();
  if (!rep) redirect("/login");
  if (!canReportFleetFault(rep.role)) redirect("/");

  const isManager = canManageFleetFaults(rep.role);
  const supabase = createClient();

  // Catálogo de vehículos (Base44). Best-effort: si falla, el formulario deja
  // escribir el vehículo a mano.
  let vehicles: { id: string; label: string }[] = [];
  try {
    const raw = await base44Flota
      .entity<FlotaVehicle>("Vehicle")
      .list({ sort_by: "brand", limit: 500 });
    vehicles = raw.map((v) => ({
      id: v.id,
      label: [v.brand, v.model, v.plates ? `· ${v.plates}` : ""].filter(Boolean).join(" ").trim(),
    }));
  } catch {
    vehicles = [];
  }

  const { data } = await supabase
    .from("fleet_fault_reports")
    .select("*, reporter:reported_by(full_name)")
    .order("created_at", { ascending: false })
    .limit(500);

  const reports: FaultReport[] = (data ?? []).map((r: any) => ({
    id: r.id,
    vehicle_id: r.vehicle_id,
    vehicle_label: r.vehicle_label,
    fault_type: r.fault_type,
    description: r.description,
    urgency: r.urgency,
    km: r.km,
    status: r.status,
    resolution_notes: r.resolution_notes,
    resolved_at: r.resolved_at,
    created_at: r.created_at,
    reported_by: r.reported_by,
    reporter_name: r.reporter?.full_name ?? null,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl">Fallas de vehículos</h1>
        <p className="text-sm text-muted-foreground">
          {isManager
            ? "Fallas reportadas por los choferes. Da seguimiento y cambia el estatus."
            : "Reporta cuando un vehículo necesite servicio, cambio de llanta, frenos, etc."}
        </p>
      </div>
      <FaultReports
        vehicles={vehicles}
        reports={reports}
        repId={rep.id}
        isManager={isManager}
      />
    </div>
  );
}
