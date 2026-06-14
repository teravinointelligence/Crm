// Recordatorio de tomas de inventario por vendedor (admin). Agrupa las
// consignaciones activas sin toma reciente por vendedor y permite enviarles
// el recordatorio. Datos de Base44 (TERAVINO Flow).

import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { isAdmin } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { loadTomasGroups } from "@/lib/tomas-inventario-email";
import { TomasRecordatorioBoard } from "@/components/consignaciones/TomasRecordatorioBoard";

export const metadata = { title: "Recordatorio de tomas por vendedor — TERAVINO CRM" };
export const dynamic = "force-dynamic";

export default async function RecordatorioTomasPage() {
  if (!(await isAdmin())) redirect("/consignaciones/tomas");

  let groups: Awaited<ReturnType<typeof loadTomasGroups>> = [];
  let loadError: string | null = null;
  try {
    groups = await loadTomasGroups();
  } catch (e) {
    loadError = e instanceof Error ? e.message : String(e);
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm">
          <Link href="/consignaciones/tomas">
            <ArrowLeft className="mr-1 h-4 w-4" /> Tomas de inventario
          </Link>
        </Button>
      </div>

      <div className="space-y-1">
        <h1 className="font-display text-3xl">Recordatorio de tomas por vendedor</h1>
        <p className="text-sm text-muted-foreground">
          Clientes con consignación activa (pendiente o parcial) que no tienen una toma de inventario
          reciente. Manda a cada vendedor su lista para que las levante esta semana.
        </p>
      </div>

      {loadError ? (
        <EmptyState
          title="No se pudieron cargar las consignaciones"
          description={loadError}
        />
      ) : groups.length === 0 ? (
        <EmptyState
          title="Todo al día"
          description="No hay clientes con consignación pendientes de toma."
        />
      ) : (
        <TomasRecordatorioBoard groups={groups} />
      )}
    </div>
  );
}
