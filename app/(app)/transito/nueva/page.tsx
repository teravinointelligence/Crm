import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/auth";
import { PurchaseOrderForm } from "@/components/transito/PurchaseOrderForm";

export const metadata = { title: "Nueva OC — TERAVINO CRM" };

export default async function NuevaOCPage({ searchParams }: { searchParams: { from?: string } }) {
  if (!(await isAdmin())) redirect("/transito");
  const supabase = createClient();
  const { data: products } = await supabase.from("products").select("*").order("supplier").order("name");
  const sourceIds = searchParams.from ? searchParams.from.split(",").filter(Boolean) : undefined;
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <h1 className="font-display text-3xl">Nueva orden de compra</h1>
      <PurchaseOrderForm products={products ?? []} sourceRequestIds={sourceIds} />
    </div>
  );
}
