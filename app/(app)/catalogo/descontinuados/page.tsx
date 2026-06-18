import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRep } from "@/lib/auth";
import { DescontinuadosClient } from "@/components/products/DescontinuadosClient";
import type { Product } from "@/types/database";

export const metadata = { title: "Productos descontinuados — TERAVINO CRM" };
export const dynamic = "force-dynamic";

export default async function DescontinuadosPage() {
  const rep = await getCurrentRep();
  if (!rep) redirect("/login");
  if (rep.role !== "admin") redirect("/catalogo");

  const supabase = createClient();
  const { data } = await supabase
    .from("products")
    .select("*")
    .not("discontinued_at", "is", null)
    .order("discontinued_at", { ascending: false });

  return (
    <div className="space-y-6">
      <DescontinuadosClient products={(data ?? []) as Product[]} repId={rep.id} />
    </div>
  );
}
