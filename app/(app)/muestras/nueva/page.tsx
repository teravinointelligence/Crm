import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRep } from "@/lib/auth";
import { SampleRequestForm } from "@/components/samples/SampleRequestForm";

export const metadata = { title: "Solicitar muestras — TERAVINO CRM" };

export default async function NuevaMuestraPage({
  searchParams,
}: {
  searchParams: { account?: string };
}) {
  const supabase = createClient();
  const rep = await getCurrentRep();
  if (!rep) redirect("/login");

  const [{ data: accounts }, { data: products }] = await Promise.all([
    supabase.from("accounts").select("id, business_name, region").order("business_name"),
    supabase
      .from("products")
      .select("id, name, supplier, varietal, vintage, active, country, region_origin")
      .eq("active", true)
      .order("supplier")
      .order("name"),
  ]);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <h1 className="font-display text-3xl">Solicitar muestras</h1>
      <SampleRequestForm
        accounts={accounts ?? []}
        products={products ?? []}
        repId={rep.id}
        defaultAccountId={searchParams.account}
      />
    </div>
  );
}
