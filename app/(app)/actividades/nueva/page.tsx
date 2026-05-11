import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRep } from "@/lib/auth";
import { ActivityForm } from "@/components/activities/ActivityForm";

export const metadata = { title: "Nueva actividad — TERAVINO CRM" };

export default async function NuevaActividadPage({
  searchParams,
}: {
  searchParams: { account?: string };
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

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="font-display text-3xl">Registrar actividad</h1>
      <ActivityForm
        accounts={accounts ?? []}
        contacts={contacts ?? []}
        repId={rep.id}
        defaultAccountId={searchParams.account}
      />
    </div>
  );
}
