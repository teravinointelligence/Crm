import { requireRep } from "@/lib/auth";
import { canAccessFacturacion } from "@/lib/modules";
import { VentasViewTabs } from "@/components/ventas/VentasViewTabs";
import { TicketPromedioClient } from "@/components/ventas/TicketPromedioClient";

export const metadata = { title: "Ticket promedio — TERAVINO CRM" };
export const dynamic = "force-dynamic";

export default async function TicketPromedioPage({
  searchParams,
}: {
  searchParams: { meses?: string };
}) {
  const rep = await requireRep();
  const isAdmin = canAccessFacturacion(rep.role);
  const meses = Math.min(12, Math.max(2, Number(searchParams.meses ?? 6)));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl">Ventas</h1>
        <p className="text-sm text-muted-foreground">
          {isAdmin
            ? "Ticket promedio por pedido — evolución mensual del equipo."
            : "Tu ticket promedio por pedido mes a mes."}
        </p>
      </div>

      <VentasViewTabs />

      <TicketPromedioClient isAdmin={isAdmin} initialMeses={meses} />
    </div>
  );
}
