// Reporte de muestras solicitadas por vendedor entre dos fechas.
//
// A diferencia de /muestras/consumo (periodos fijos de 30/90/365 días y análisis
// de costo por encarte, solo admin/contador), aquí el rango lo elige el usuario
// y el corte es por vendedor con su detalle de solicitudes, para sacar el
// reporte de un mes, una quincena o cualquier periodo cerrado.
//
// La consulta y los cortes viven en lib/muestras-reporte.ts, compartidos con la
// ruta del PDF (/api/muestras/reporte/pdf).
//
// El alcance lo pone RLS (migración 0010): admin ve a todo el equipo, el
// vendedor solo sus propias solicitudes.

import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRep } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { SampleReportClient } from "@/components/samples/SampleReportClient";
import { loadSampleReport, normalizaRango } from "@/lib/muestras-reporte";
import { dateKeyTz } from "@/lib/utils";

export const metadata = { title: "Reporte de muestras — TERAVINO CRM" };
export const dynamic = "force-dynamic";

export default async function ReporteMuestrasPage({
  searchParams,
}: {
  searchParams: { desde?: string; hasta?: string };
}) {
  const rep = await getCurrentRep();
  if (!rep) redirect("/login");

  const hoy = dateKeyTz(new Date());
  const { desde, hasta } = normalizaRango(searchParams.desde, searchParams.hasta, hoy);

  const rows = await loadSampleReport(createClient(), desde, hasta);

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href="/muestras"><ArrowLeft className="mr-1 h-4 w-4" /> Muestras</Link>
      </Button>

      <div>
        <h1 className="font-display text-3xl">Reporte de muestras por vendedor</h1>
        <p className="text-sm text-muted-foreground">
          Muestras solicitadas en el rango de fechas que elijas, agrupadas por vendedor y con el
          detalle de cada solicitud. Descargable en PDF y CSV.
          {rep.role !== "admin" && " Ves únicamente tus propias solicitudes."}
        </p>
      </div>

      <SampleReportClient rows={rows} desde={desde} hasta={hasta} hoy={hoy} />
    </div>
  );
}
