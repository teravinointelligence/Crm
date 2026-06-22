import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRep } from "@/lib/auth";
import { SELLER_ROLES } from "@/lib/modules";
import { EventForm } from "@/components/eventos/EventForm";
import type { RepOption } from "@/lib/visitas/constants";

export const dynamic = "force-dynamic";
export const metadata = { title: "Nuevo evento — TERAVINO CRM" };

export default async function NuevoEventoPage({
  searchParams,
}: {
  searchParams: { visita?: string };
}) {
  const me = await getCurrentRep();
  if (!me) redirect("/login");
  if (me.role !== "admin") redirect("/eventos");

  const supabase = createClient();
  const [{ data: reps }, { data: visits }] = await Promise.all([
    supabase.from("sales_reps").select("id, full_name").in("role", SELLER_ROLES).order("full_name"),
    supabase
      .from("supplier_visits")
      .select("id, provider_name, arrival_date")
      .order("arrival_date", { ascending: false }),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="font-display text-3xl">Nuevo evento</h1>
      <EventForm
        reps={(reps ?? []) as RepOption[]}
        visits={(visits ?? []) as { id: string; provider_name: string; arrival_date: string }[]}
        repId={me.id}
        defaultVisitId={searchParams.visita}
      />
    </div>
  );
}
