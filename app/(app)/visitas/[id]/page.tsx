import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Pencil, MapPin, CalendarDays, User } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRep } from "@/lib/auth";
import { canViewVisitas } from "@/lib/modules";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { VisitActivities } from "@/components/visitas/VisitActivities";
import { formatDate } from "@/lib/utils";
import {
  EVENT_STATUS_BADGE,
  EVENT_STATUS_LABEL,
  EVENT_TYPE_LABEL,
  VISIT_STATUS_BADGE,
  VISIT_STATUS_LABEL,
  type AccountOption,
  type EventStatus,
  type EventType,
  type VisitActivity,
  type VisitStatus,
} from "@/lib/visitas/constants";

export const dynamic = "force-dynamic";

type VisitRow = {
  id: string;
  provider_name: string;
  winery_brand: string | null;
  arrival_date: string;
  departure_date: string;
  city: string;
  status: VisitStatus;
  notes: string | null;
  coordinator: { full_name: string | null } | null;
};

export default async function VisitDetailPage({ params }: { params: { id: string } }) {
  const me = await getCurrentRep();
  if (!me) redirect("/login");
  if (!canViewVisitas(me.role)) redirect("/");
  const isAdmin = me.role === "admin";

  const supabase = createClient();
  const [{ data: visit }, { data: acts }, { data: accounts }, { data: events }] = await Promise.all([
    supabase
      .from("supplier_visits")
      .select(
        "id, provider_name, winery_brand, arrival_date, departure_date, city, status, notes, coordinator:coordinator_id(full_name)",
      )
      .eq("id", params.id)
      .maybeSingle(),
    supabase
      .from("visit_activities")
      .select(
        "id, visit_id, event_id, day_date, start_time, end_time, activity_type, title, account_id, client_name, location, city, status, notes, sort_order",
      )
      .eq("visit_id", params.id)
      .order("day_date")
      .order("start_time", { nullsFirst: true }),
    supabase.from("accounts").select("id, business_name, region").order("business_name"),
    supabase
      .from("events")
      .select("id, name, event_type, status, start_date")
      .eq("visit_id", params.id)
      .order("start_date"),
  ]);

  if (!visit) notFound();
  const v = visit as unknown as VisitRow;

  return (
    <div className="space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2">
          <Link href="/visitas">
            <ArrowLeft className="mr-1 h-4 w-4" /> Visitas
          </Link>
        </Button>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-display text-3xl">{v.provider_name}</h1>
              <Badge variant={VISIT_STATUS_BADGE[v.status]}>{VISIT_STATUS_LABEL[v.status]}</Badge>
            </div>
            {v.winery_brand && <p className="text-muted-foreground">{v.winery_brand}</p>}
          </div>
          {isAdmin && (
            <Button asChild variant="outline" size="sm">
              <Link href={`/visitas/${v.id}/editar`}>
                <Pencil className="mr-1 h-4 w-4" /> Editar
              </Link>
            </Button>
          )}
        </div>
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <CalendarDays className="h-4 w-4" />
            {formatDate(v.arrival_date)} – {formatDate(v.departure_date)}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <MapPin className="h-4 w-4" /> {v.city}
          </span>
          {v.coordinator?.full_name && (
            <span className="inline-flex items-center gap-1.5">
              <User className="h-4 w-4" /> {v.coordinator.full_name}
            </span>
          )}
        </div>
        {v.notes && <p className="mt-3 rounded-lg bg-muted/40 p-3 text-sm">{v.notes}</p>}
      </div>

      {(events ?? []).length > 0 && (
        <section className="space-y-2">
          <h2 className="font-display text-xl">Eventos de esta visita</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {(events ?? []).map((e: any) => (
              <Link
                key={e.id}
                href={`/eventos/${e.id}`}
                className="flex items-center justify-between rounded-lg border bg-card p-3 hover:border-brand-carmesi/40"
              >
                <div>
                  <p className="font-medium">{e.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {EVENT_TYPE_LABEL[e.event_type as EventType]} · {formatDate(e.start_date)}
                  </p>
                </div>
                <Badge variant={EVENT_STATUS_BADGE[e.status as EventStatus]}>
                  {EVENT_STATUS_LABEL[e.status as EventStatus]}
                </Badge>
              </Link>
            ))}
          </div>
        </section>
      )}

      <VisitActivities
        visitId={v.id}
        arrivalDate={v.arrival_date}
        departureDate={v.departure_date}
        activities={(acts ?? []) as unknown as VisitActivity[]}
        accounts={(accounts ?? []) as AccountOption[]}
        repId={me.id}
        canEdit
      />
    </div>
  );
}
