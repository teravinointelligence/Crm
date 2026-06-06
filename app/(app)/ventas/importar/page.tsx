import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/auth";
import { ImportVentasClient } from "@/components/ventas/ImportVentasClient";

export const metadata = { title: "Importar ventas — TERAVINO CRM" };

export default async function ImportarVentasPage() {
  if (!(await isAdmin())) redirect("/ventas");
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="font-display text-2xl sm:text-3xl">Importar ventas mensuales</h1>
        <p className="text-sm text-muted-foreground">
          Carga el reporte de ventas por vendedor (CONTPAQ). Se distribuye automáticamente
          a cada vendedor según sus clientes asignados.
        </p>
      </div>
      <ImportVentasClient />
    </div>
  );
}
