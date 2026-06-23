import { requireRep } from "@/lib/auth";
import { canAccessFacturacion } from "@/lib/modules";
import { VentasViewTabs } from "@/components/ventas/VentasViewTabs";
import { VencidoGeneradoClient } from "@/components/ventas/VencidoGeneradoClient";

export const metadata = { title: "Vencido generado — TERAVINO CRM" };
export const dynamic = "force-dynamic";

export default async function VencidoGeneradoPage({
  searchParams,
}: {
  searchParams: { mes?: string };
}) {
  const rep = await requireRep();
  const isAdmin = canAccessFacturacion(rep.role);

  const now = new Date();
  const mesDefault = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const mes = searchParams.mes ?? mesDefault;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl">Ventas</h1>
        <p className="text-sm text-muted-foreground">
          {isAdmin
            ? "Facturas que vencieron este mes sin haberse pagado, por vendedor."
            : "Tus facturas que vencieron este mes sin pagarse."}
        </p>
      </div>

      <VentasViewTabs />

      <VencidoGeneradoClient isAdmin={isAdmin} initialMes={mes} />
    </div>
  );
}
