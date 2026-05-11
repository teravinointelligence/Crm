import { redirect } from "next/navigation";
import { getCurrentRep, isAdmin } from "@/lib/auth";
import { ImportExcelClient } from "@/components/products/ImportExcelClient";

export const metadata = { title: "Importar catálogo — TERAVINO CRM" };

export default async function ImportarPage() {
  if (!(await isAdmin())) redirect("/catalogo");
  const rep = await getCurrentRep();
  if (!rep) redirect("/login");
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="font-display text-3xl">Importar desde Excel</h1>
        <p className="text-sm text-muted-foreground">
          Sincroniza con CONTPAQi subiendo el Excel exportado.
        </p>
      </div>
      <ImportExcelClient repId={rep.id} />
    </div>
  );
}
