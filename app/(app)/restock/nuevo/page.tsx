import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRep } from "@/lib/auth";
import { RestockRequestForm } from "@/components/restock/RestockRequestForm";

export const metadata = { title: "Nuevo restock — TERAVINO CRM" };

export default async function NuevoRestockPage() {
  const supabase = createClient();
  const rep = await getCurrentRep();
  if (!rep) redirect("/login");
  const { data: products } = await supabase
    .from("products")
    .select("*")
    .eq("active", true)
    .order("supplier")
    .order("name");
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <h1 className="font-display text-2xl sm:text-3xl">Nuevo pedido de restock</h1>
      <RestockRequestForm products={products ?? []} repId={rep.id} defaultRegion={rep.primary_region} />
    </div>
  );
}
