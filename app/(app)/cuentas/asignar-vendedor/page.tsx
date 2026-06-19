import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/auth";
import { SELLER_ROLES } from "@/lib/modules";
import { Button } from "@/components/ui/button";
import {
  AsignarVendedorBoard,
  type CuentaSinVendedor,
  type RepOption,
} from "@/components/accounts/AsignarVendedorBoard";

export const metadata = { title: "Asignar vendedor — TERAVINO CRM" };

export default async function AsignarVendedorPage() {
  if (!(await isAdmin())) redirect("/cuentas");
  const supabase = createClient();

  const [{ data: cuentas }, { data: reps }] = await Promise.all([
    supabase
      .from("accounts")
      .select("id, client_number, business_name, region, city")
      .is("assigned_rep_id", null)
      .order("business_name", { ascending: true }),
    supabase
      .from("sales_reps")
      .select("id, full_name")
      .eq("active", true)
      .in("role", SELLER_ROLES)
      .order("full_name"),
  ]);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm">
          <Link href="/cuentas">
            <ArrowLeft className="mr-1 h-4 w-4" /> Cuentas
          </Link>
        </Button>
        <h1 className="mt-2 font-display text-3xl">Asignar vendedor</h1>
        <p className="text-sm text-muted-foreground">
          Cuentas sin vendedor asignado. Elige uno en el select y se guarda al
          instante.
        </p>
      </div>

      <AsignarVendedorBoard
        cuentas={(cuentas ?? []) as CuentaSinVendedor[]}
        reps={(reps ?? []) as RepOption[]}
      />
    </div>
  );
}
