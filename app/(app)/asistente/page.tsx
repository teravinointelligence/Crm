import { redirect } from "next/navigation";
import { getCurrentRep } from "@/lib/auth";
import { canSeeFinance } from "@/lib/modules";
import { AsistenteChat } from "@/components/asistente/AsistenteChat";

export const metadata = { title: "Asistente — TERAVINO CRM" };

export default async function AsistentePage() {
  const rep = await getCurrentRep();
  if (!rep) redirect("/login");

  return (
    <div className="mx-auto flex h-[calc(100vh-8rem)] max-w-3xl flex-col">
      <div className="mb-3">
        <h1 className="font-display text-3xl">Asistente</h1>
        <p className="text-sm text-muted-foreground">
          Pregunta en lenguaje natural sobre cartera, ventas, cuentas y reabasto. Las respuestas
          salen de consultas seguras del CRM (respetan tus permisos); las cifras nunca las inventa el modelo.
        </p>
      </div>
      <AsistenteChat canSeeFinance={canSeeFinance(rep.role)} />
    </div>
  );
}
