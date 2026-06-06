import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRep } from "@/lib/auth";
import { ActivityForm } from "@/components/activities/ActivityForm";
import type { ActivityStatus } from "@/types/database";

export const metadata = { title: "Nueva actividad — TERAVINO CRM" };

export default async function NuevaActividadPage({
  searchParams,
}: {
  searchParams: { account?: string; estado?: string; fecha?: string };
}) {
  const supabase = createClient();
  const rep = await getCurrentRep();
  if (!rep) redirect("/login");

  const [{ data: accounts }, { data: contacts }] = await Promise.all([
    supabase
      .from("accounts")
      .select("id, business_name, region")
      .order("business_name"),
    supabase.from("contacts").select("*").order("full_name"),
  ]);

  const status: ActivityStatus =
    searchParams.estado === "agendada" ? "agendada" : "realizada";
  const fecha = /^\d{4}-\d{2}-\d{2}$/.test(searchParams.fecha ?? "")
    ? searchParams.fecha
    : undefined;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="font-display text-2xl sm:text-3xl">
        {status === "agendada" ? "Agendar actividad" : "Registrar actividad"}
      </h1>
      <ActivityForm
        accounts={accounts ?? []}
        contacts={contacts ?? []}
        repId={rep.id}
        defaultAccountId={searchParams.account}
        defaultStatus={status}
        defaultDate={fecha}
      />
    </div>
  );
}
