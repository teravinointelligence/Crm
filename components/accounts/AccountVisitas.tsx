// Panel de la ficha de Cuenta: próximas actividades de visitas de proveedor y
// eventos a los que está invitada esta cuenta. Server component (RLS de sesión).
import Link from "next/link";
import { CalendarClock, Wine, MapPin } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatDateTime } from "@/lib/utils";
import {
  ACTIVITY_STATUS_BADGE,
  ACTIVITY_STATUS_LABEL,
  ACTIVITY_TYPE_LABEL,
  CONFIRMATION_STATUS_BADGE,
  CONFIRMATION_STATUS_LABEL,
  EVENT_TYPE_LABEL,
  type ActivityStatus,
  type ActivityType,
  type ConfirmationStatus,
  type EventType,
} from "@/lib/visitas/constants";

export async function AccountVisitas({ accountId }: { accountId: string }) {
  const supabase = createClient();
  // Ventana: desde hace 7 días en adelante (lo próximo + lo muy reciente).
  const since = new Date();
  since.setDate(since.getDate() - 7);
  const sinceDay = since.toISOString().slice(0, 10);
  const sinceTs = since.toISOString();

  const [{ data: acts }, { data: guests }] = await Promise.all([
    supabase
      .from("visit_activities")
      .select(
        "id, visit_id, day_date, start_time, activity_type, title, location, status, visit:visit_id(provider_name, city)",
      )
      .eq("account_id", accountId)
      .gte("day_date", sinceDay)
      .order("day_date")
      .limit(8),
    supabase
      .from("event_guests")
      .select(
        "id, confirmation_status, event:event_id(id, name, event_type, start_date, city, status)",
      )
      .eq("account_id", accountId)
      .limit(20),
  ]);

  const activities = (acts ?? []) as any[];
  const events = ((guests ?? []) as any[])
    .filter((g) => g.event && new Date(g.event.start_date).getTime() >= since.getTime())
    .sort((a, b) => a.event.start_date.localeCompare(b.event.start_date))
    .slice(0, 8);

  if (activities.length === 0 && events.length === 0) return null;

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div className="flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-brand-carmesi" />
          <h3 className="font-display text-lg">Visitas y eventos</h3>
        </div>

        {activities.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Actividades de visitas de proveedor
            </p>
            {activities.map((a) => (
              <Link
                key={a.id}
                href={`/visitas/${a.visit_id}`}
                className="flex items-center justify-between gap-2 rounded-lg border p-2.5 text-sm hover:border-brand-carmesi/40"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{a.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {ACTIVITY_TYPE_LABEL[a.activity_type as ActivityType]} ·{" "}
                    {formatDate(a.day_date)}
                    {a.start_time ? ` ${a.start_time.slice(0, 5)}` : ""}
                    {a.visit?.provider_name ? ` · ${a.visit.provider_name}` : ""}
                  </p>
                </div>
                <Badge variant={ACTIVITY_STATUS_BADGE[a.status as ActivityStatus]}>
                  {ACTIVITY_STATUS_LABEL[a.status as ActivityStatus]}
                </Badge>
              </Link>
            ))}
          </div>
        )}

        {events.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Eventos
            </p>
            {events.map((g) => (
              <Link
                key={g.id}
                href={`/eventos/${g.event.id}`}
                className="flex items-center justify-between gap-2 rounded-lg border p-2.5 text-sm hover:border-brand-carmesi/40"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    <Wine className="mr-1 inline h-3.5 w-3.5 text-brand-carmesi" />
                    {g.event.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {EVENT_TYPE_LABEL[g.event.event_type as EventType]} ·{" "}
                    {formatDateTime(g.event.start_date)}
                    <span className="ml-1 inline-flex items-center gap-0.5">
                      <MapPin className="h-3 w-3" /> {g.event.city}
                    </span>
                  </p>
                </div>
                <Badge variant={CONFIRMATION_STATUS_BADGE[g.confirmation_status as ConfirmationStatus]}>
                  {CONFIRMATION_STATUS_LABEL[g.confirmation_status as ConfirmationStatus]}
                </Badge>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
