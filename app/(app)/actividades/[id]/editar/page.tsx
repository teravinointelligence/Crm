import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, CalendarPlus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRep } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { ActivityForm } from "@/components/activities/ActivityForm";
import { googleCalendarUrl } from "@/lib/calendar-links";
import type { Activity } from "@/types/database";

export const metadata = { title: "Editar actividad — TERAVINO CRM" };

export default async function EditarActividadPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const rep = await getCurrentRep();
  if (!rep) redirect("/login");

  // La RLS limita activities al admin o al dueño/rep asignado; si no la ve, 404.
  const { data: activity } = await supabase
    .from("activities")
    .select("*")
    .eq("id", params.id)
    .maybeSingle();
  if (!activity) notFound();

  const [{ data: accounts }, { data: contacts }] = await Promise.all([
    supabase.from("accounts").select("id, business_name, region").order("business_name"),
    supabase.from("contacts").select("*").order("full_name"),
  ]);

  const act = activity as Activity;
  const account = (accounts ?? []).find((a) => a.id === act.account_id);
  const accountName = account?.business_name ?? "Cuenta";
  const gcalUrl = googleCalendarUrl({
    title: `${accountName} · ${act.activity_type ?? "actividad"}`,
    startISO: act.activity_date,
    durationMinutes: act.duration_minutes,
    details: [act.outcome, act.next_step ? `Siguiente: ${act.next_step}` : null, act.notes]
      .filter(Boolean)
      .join("\n"),
    location: [accountName, account?.region].filter(Boolean).join(", "),
  });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href={`/cuentas/${act.account_id}`}>
          <ArrowLeft className="mr-1 h-4 w-4" /> Cuenta
        </Link>
      </Button>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl">Editar actividad</h1>
        <Button asChild variant="outline" size="sm">
          <a href={gcalUrl} target="_blank" rel="noreferrer">
            <CalendarPlus className="mr-1 h-4 w-4" /> Agregar a Google Calendar
          </a>
        </Button>
      </div>
      <ActivityForm
        accounts={accounts ?? []}
        contacts={contacts ?? []}
        repId={rep.id}
        activity={act}
      />
    </div>
  );
}
