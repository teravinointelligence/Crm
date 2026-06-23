import { requireRep } from "@/lib/auth";
import { canAccessFacturacion } from "@/lib/modules";
import { VentasViewTabs } from "@/components/ventas/VentasViewTabs";
import { EficienciaCobroClient } from "@/components/ventas/EficienciaCobroClient";

export const metadata = { title: "Eficiencia de cobro — TERAVINO CRM" };
export const dynamic = "force-dynamic";

export default async function EficienciaCobroPage({
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
            ? "Qué tan eficiente está cobrando cada vendedor su cartera vencida."
            : "Tu eficiencia de cobro sobre la cartera vencida."}
        </p>
      </div>

      <VentasViewTabs />

      <EficienciaCobroClient isAdmin={isAdmin} initialMes={mes} />
    </div>
  );
}
