import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getCurrentRep } from "@/lib/auth";
import { canSeeFinance } from "@/lib/modules";
import { Button } from "@/components/ui/button";
import { CatalogImport } from "@/components/cartera/conciliacion/CatalogImport";

export const metadata = { title: "Catálogo de pagadores — TERAVINO CRM" };

export default async function CatalogoPage() {
  const rep = await getCurrentRep();
  if (!rep) redirect("/login");
  if (!canSeeFinance(rep.role)) redirect("/cartera");

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm">
          <Link href="/cartera/conciliacion">
            <ArrowLeft className="mr-1 h-4 w-4" /> Conciliación
          </Link>
        </Button>
      </div>

      <div className="space-y-1">
        <h1 className="font-display text-3xl">Catálogo de pagadores</h1>
        <p className="text-sm text-muted-foreground">
          Sube tu catálogo de clientes identificados (Excel). El sistema casa cada cliente con su
          cuenta del CRM y aprende sus llaves (BNET, RFC, nombre) para auto-identificar los depósitos
          en los próximos estados de cuenta.
        </p>
      </div>

      <CatalogImport />
    </div>
  );
}
