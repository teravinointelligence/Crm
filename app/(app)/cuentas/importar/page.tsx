import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { ImportClientesFiscalClient } from "@/components/accounts/ImportClientesFiscalClient";

export const metadata = { title: "Cargar datos de clientes — TERAVINO CRM" };

export default async function ImportarClientesPage() {
  if (!(await isAdmin())) redirect("/cuentas");

  const supabase = createClient();
  const { data } = await supabase
    .from("accounts")
    .select("id, business_name, client_number, rfc, fiscal_name, uso_cfdi, regimen_fiscal")
    .order("business_name")
    .range(0, 49999);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href="/cuentas">
          <ArrowLeft className="mr-1 h-4 w-4" /> Cuentas
        </Link>
      </Button>
      <div>
        <h1 className="font-display text-3xl">Cargar datos de clientes</h1>
        <p className="text-sm text-muted-foreground">
          Importa datos fiscales (RFC, razón social, uso CFDI y régimen fiscal) desde el
          catálogo de clientes de CONTPAQi y enlázalos a las cuentas por # cliente.
        </p>
      </div>
      <ImportClientesFiscalClient accounts={(data ?? []) as never} />
    </div>
  );
}
