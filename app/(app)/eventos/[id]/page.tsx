import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Pencil, MapPin, CalendarDays, User, Users, ExternalLink } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRep } from "@/lib/auth";
import { canViewVisitas, SELLER_ROLES } from "@/lib/modules";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EventGuests, type GuestRow } from "@/components/eventos/EventGuests";
import { EventWines, type WineRow } from "@/components/eventos/EventWines";
import { EventStaff, type StaffRow } from "@/components/eventos/EventStaff";
import { EventChecklist, type ChecklistRow } from "@/components/eventos/EventChecklist";
import { EventFiles, type FileRow } from "@/components/eventos/EventFiles";
import { formatDateTime } from "@/lib/utils";
import {
  EVENT_STATUS_BADGE,
  EVENT_STATUS_LABEL,
  EVENT_TYPE_LABEL,
  type AccountOption,
  type EventStatus,
  type EventType,
  type RepOption,
} from "@/lib/visitas/constants";

export const dynamic = "force-dynamic";

export default async function EventoDetailPage({ params }: { params: { id: string } }) {
  const me = await getCurrentRep();
  if (!me) redirect("/login");
  if (!canViewVisitas(me.role)) redirect("/");
  const isAdmin = me.role === "admin";

  const supabase = createClient();
  const [
    { data: event },
    { data: wines },
    { data: staff },
    { data: checklist },
    { data: files },
    { data: guests },
    { data: accounts },
    { data: reps },
  ] = await Promise.all([
    supabase
      .from("events")
      .select(
        "id, name, event_type, description, start_date, end_date, venue_name, venue_address, venue_map_url, venue_contact, city, winery_brand, max_capacity, confirmation_deadline, status, dress_code_staff, notes, flyer_url, coordinator:coordinator_id(full_name), visit:visit_id(id, provider_name)",
      )
      .eq("id", params.id)
      .maybeSingle(),
    supabase
      .from("event_wines")
      .select("id, wine_name, winery, vintage, bottle_count, pairing_order, notes")
      .eq("event_id", params.id)
      .order("pairing_order", { nullsFirst: false }),
    supabase
      .from("event_staff")
      .select("id, sales_rep_id, role_in_event, rep:sales_rep_id(full_name)")
      .eq("event_id", params.id),
    supabase
      .from("event_checklist")
      .select("id, item, is_ready, sort_order")
      .eq("event_id", params.id)
      .order("sort_order"),
    supabase
      .from("event_files")
      .select("id, file_url, file_name, file_type")
      .eq("event_id", params.id)
      .order("created_at"),
    supabase
      .from("event_guests")
      .select(
        "id, account_id, contact_id, guest_name, guest_email, invitation_status, confirmation_status, checked_in, contact:contact_id(full_name, email), account:account_id(business_name)",
      )
      .eq("event_id", params.id)
      .order("created_at"),
    supabase.from("accounts").select("id, business_name, region").order("business_name"),
    supabase.from("sales_reps").select("id, full_name").in("role", SELLER_ROLES).order("full_name"),
  ]);

  if (!event) notFound();
  const ev = event as any;

  return (
    <div className="space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2">
          <Link href="/eventos">
            <ArrowLeft className="mr-1 h-4 w-4" /> Eventos
          </Link>
        </Button>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-3xl">{ev.name}</h1>
              <Badge variant={EVENT_STATUS_BADGE[ev.status as EventStatus]}>
                {EVENT_STATUS_LABEL[ev.status as EventStatus]}
              </Badge>
            </div>
            <p className="text-muted-foreground">
              {EVENT_TYPE_LABEL[ev.event_type as EventType]}
              {ev.winery_brand ? ` · ${ev.winery_brand}` : ""}
            </p>
          </div>
          {isAdmin && (
            <Button asChild variant="outline" size="sm">
              <Link href={`/eventos/${ev.id}/editar`}>
                <Pencil className="mr-1 h-4 w-4" /> Editar
              </Link>
            </Button>
          )}
        </div>
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <CalendarDays className="h-4 w-4" /> {formatDateTime(ev.start_date)}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <MapPin className="h-4 w-4" /> {ev.venue_name ? `${ev.venue_name}, ` : ""}
            {ev.city}
          </span>
          {ev.coordinator?.full_name && (
            <span className="inline-flex items-center gap-1.5">
              <User className="h-4 w-4" /> {ev.coordinator.full_name}
            </span>
          )}
          {ev.max_capacity != null && (
            <span className="inline-flex items-center gap-1.5">
              <Users className="h-4 w-4" /> Cupo {ev.max_capacity}
            </span>
          )}
        </div>
        {ev.venue_map_url && (
          <a
            href={ev.venue_map_url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-flex items-center gap-1 text-sm text-brand-carmesi hover:underline"
          >
            Ver ubicación <ExternalLink className="h-3 w-3" />
          </a>
        )}
        {ev.visit?.id && (
          <p className="mt-2 text-sm">
            Parte de la visita{" "}
            <Link href={`/visitas/${ev.visit.id}`} className="text-brand-carmesi hover:underline">
              {ev.visit.provider_name}
            </Link>
          </p>
        )}
        {ev.description && <p className="mt-3 rounded-lg bg-muted/40 p-3 text-sm">{ev.description}</p>}
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        <section className="space-y-6">
          <EventGuests
            eventId={ev.id}
            guests={(guests ?? []) as unknown as GuestRow[]}
            accounts={(accounts ?? []) as AccountOption[]}
            repId={me.id}
            canInvite
          />
          <EventChecklist
            eventId={ev.id}
            items={(checklist ?? []) as ChecklistRow[]}
            canManage={isAdmin}
          />
        </section>
        <section className="space-y-6">
          <EventWines eventId={ev.id} wines={(wines ?? []) as WineRow[]} canManage={isAdmin} />
          <EventStaff
            eventId={ev.id}
            staff={(staff ?? []) as unknown as StaffRow[]}
            reps={(reps ?? []) as RepOption[]}
            canManage={isAdmin}
          />
          <EventFiles eventId={ev.id} files={(files ?? []) as FileRow[]} canManage={isAdmin} />
        </section>
      </div>
    </div>
  );
}
