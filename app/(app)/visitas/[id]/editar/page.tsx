import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRep } from "@/lib/auth";
import { SELLER_ROLES } from "@/lib/modules";
import { VisitForm } from "@/components/visitas/VisitForm";
import type { RepOption, SupplierVisit } from "@/lib/visitas/constants";

export const dynamic = "force-dynamic";
export const metadata = { title: "Editar visita — TERAVINO CRM" };

export default async function EditarVisitaPage({ params }: { params: { id: string } }) {
  const me = await getCurrentRep();
  if (!me) redirect("/login");
  if (me.role !== "admin") redirect(`/visitas/${params.id}`);

  const supabase = createClient();
  const [{ data: visit }, { data: reps }] = await Promise.all([
    supabase
      .from("supplier_visits")
      .select(
        "id, provider_name, winery_brand, arrival_date, departure_date, city, coordinator_id, status, notes",
      )
      .eq("id", params.id)
      .maybeSingle(),
    supabase.from("sales_reps").select("id, full_name").in("role", SELLER_ROLES).order("full_name"),
  ]);

  if (!visit) notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="font-display text-3xl">Editar visita</h1>
      <VisitForm
        reps={(reps ?? []) as RepOption[]}
        repId={me.id}
        visit={visit as unknown as SupplierVisit}
      />
    </div>
  );
}
