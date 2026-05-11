import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/auth";
import { ImportCarteraClient } from "@/components/cartera/ImportCarteraClient";

export const metadata = { title: "Importar cartera — TERAVINO CRM" };

export default async function ImportarCarteraPage() {
  if (!(await isAdmin())) redirect("/cartera");
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="font-display text-3xl">Importar cartera</h1>
        <p className="text-sm text-muted-foreground">
          Carga inicial de facturas históricas y pagos desde Excel.
        </p>
      </div>
      <ImportCarteraClient />
    </div>
  );
}
