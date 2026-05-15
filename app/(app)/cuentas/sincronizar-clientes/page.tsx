import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRep } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { ClientMatcher } from "@/components/accounts/ClientMatcher";

export const metadata = { title: "Sincronizar # cliente — TERAVINO CRM" };

const norm = (s: string | null | undefined) =>
  (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();

export default async function Page() {
  const rep = await getCurrentRep();
  if (!rep) redirect("/login");
  if (rep.role !== "admin") redirect("/cuentas");

  const supabase = createClient();

  const [{ data: pairsAll }, { data: accountsAll }] = await Promise.all([
    supabase
      .from("clientes_relacion_raw")
      .select("id, num_cliente, nombre_comercial, razon_social, vendedor, locacion")
      .neq("nombre_comercial", "")
      .eq("ignored", false)
      .order("num_cliente"),
    supabase
      .from("accounts")
      .select("id, business_name, region, fiscal_name, client_number, status, sales_reps:assigned_rep_id(full_name)")
      .order("business_name"),
  ]);

  const pairs = (pairsAll ?? []) as Array<{
    id: number; num_cliente: string; nombre_comercial: string; razon_social: string | null; vendedor: string | null; locacion: string | null;
  }>;
  const accounts = (accountsAll ?? []) as unknown as Array<{
    id: string; business_name: string; region: string | null; fiscal_name: string | null;
    client_number: string | null; status: string | null; sales_reps: { full_name: string | null } | null;
  }>;

  // Un par se considera "satisfecho" si existe una cuenta con el mismo num_cliente y
  // un business_name normalizado que coincida con el nombre_comercial del par.
  const linked = new Set(
    accounts
      .filter((a) => a.client_number)
      .map((a) => `${a.client_number}|${norm(a.business_name)}`),
  );
  const pending = pairs.filter(
    (p) => !linked.has(`${p.num_cliente}|${norm(p.nombre_comercial)}`),
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href="/cuentas"><ArrowLeft className="mr-1 h-4 w-4" /> Cuentas</Link>
      </Button>
      <div>
        <h1 className="font-display text-3xl">Sincronizar # cliente</h1>
        <p className="text-sm text-muted-foreground">
          Pares de la relación de clientes (CONTPAQi, abril 2026) que aún no están enlazados a una cuenta.
          Asigna cada uno o márcalo como «no aplica» si no es un cliente real.
        </p>
      </div>

      <ClientMatcher pairs={pending} accounts={accounts} totalPairs={pairs.length} />
    </div>
  );
}
