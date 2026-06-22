import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRep } from "@/lib/auth";
import { SELLER_ROLES } from "@/lib/modules";
import { VisitForm } from "@/components/visitas/VisitForm";
import type { RepOption } from "@/lib/visitas/constants";

export const dynamic = "force-dynamic";
export const metadata = { title: "Nueva visita — TERAVINO CRM" };

export default async function NuevaVisitaPage() {
  const me = await getCurrentRep();
  if (!me) redirect("/login");
  if (me.role !== "admin") redirect("/visitas");

  const supabase = createClient();
  const { data: reps } = await supabase
    .from("sales_reps")
    .select("id, full_name")
    .in("role", SELLER_ROLES)
    .order("full_name");

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="font-display text-3xl">Nueva visita de proveedor</h1>
      <VisitForm reps={(reps ?? []) as RepOption[]} repId={me.id} />
    </div>
  );
}
