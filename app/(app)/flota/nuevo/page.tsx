// Alta de un vehículo nuevo en la flota. Reusa VehicleForm en modo "crear"
// (sin vehículo) → POST /api/flota.

import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getCurrentRep } from "@/lib/auth";
import { canAccessFlota } from "@/lib/modules";
import { VehicleForm } from "@/components/flota/VehicleForm";

export const metadata = { title: "Nuevo vehículo — Flota — TERAVINO CRM" };
export const dynamic = "force-dynamic";

export default async function NuevoVehiculoPage() {
  const rep = await getCurrentRep();
  if (!rep) redirect("/login");
  if (!canAccessFlota(rep.role)) redirect("/");

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/flota"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver a la flota
        </Link>
        <h1 className="mt-2 font-display text-3xl">Nuevo vehículo</h1>
        <p className="text-sm text-muted-foreground">
          Registra un auto en la flota. Marca, modelo y año son obligatorios; el resto se puede
          completar después.
        </p>
      </div>

      <VehicleForm />
    </div>
  );
}
