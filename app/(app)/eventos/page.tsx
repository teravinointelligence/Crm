import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus, Wine, MapPin, CalendarDays, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRep } from "@/lib/auth";
import { canViewVisitas } from "@/lib/modules";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDateTime } from "@/lib/utils";
import {
  EVENT_STATUS_BADGE,
  EVENT_STATUS_LABEL,
  EVENT_TYPE_LABEL,
  type EventStatus,
  type EventType,
} from "@/lib/visitas/constants";

export const dynamic = "force-dynamic";
export const metadata = { title: "Eventos — TERAVINO CRM" };

type Row = {
  id: string;
  name: string;
  event_type: EventType;
  start_date: string;
  city: string;
  winery_brand: string | null;
  status: EventStatus;
  event_guests: { count: number }[];
};

export default async function EventosPage() {
  const me = await getCurrentRep();
  if (!me) redirect("/login");
  if (!canViewVisitas(me.role)) redirect("/");
  const isAdmin = me.role === "admin";

  const supabase = createClient();
  const { data } = await supabase
    .from("events")
    .select("id, name, event_type, start_date, city, winery_brand, status, event_guests(count)")
    .order("start_date", { ascending: false });

  const rows = (data ?? []) as unknown as Row[];

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl">Eventos</h1>
          <p className="text-sm text-muted-foreground">
            Cenas maridaje, lunches, lanzamientos y festivales con invitaciones.
          </p>
        </div>
        {isAdmin && (
          <Button asChild>
            <Link href="/eventos/nuevo">
              <Plus className="mr-1 h-4 w-4" /> Nuevo evento
            </Link>
          </Button>
        )}
      </header>

      {rows.length === 0 ? (
        <EmptyState
          icon={Wine}
          title="Sin eventos"
          description="Crea un evento para gestionar invitaciones, vinos del maridaje, staff y checklist."
          action={
            isAdmin ? (
              <Button asChild>
                <Link href="/eventos/nuevo">
                  <Plus className="mr-1 h-4 w-4" /> Nuevo evento
                </Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((e) => (
            <Link
              key={e.id}
              href={`/eventos/${e.id}`}
              className="block rounded-xl border bg-card p-4 shadow-sm transition-colors hover:border-brand-carmesi/40"
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-display text-lg leading-tight">{e.name}</h3>
                <Badge variant={EVENT_STATUS_BADGE[e.status]}>{EVENT_STATUS_LABEL[e.status]}</Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {EVENT_TYPE_LABEL[e.event_type]}
                {e.winery_brand ? ` · ${e.winery_brand}` : ""}
              </p>
              <div className="mt-3 space-y-1 text-sm text-muted-foreground">
                <p className="inline-flex items-center gap-1.5">
                  <CalendarDays className="h-3.5 w-3.5" /> {formatDateTime(e.start_date)}
                </p>
                <p className="inline-flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5" /> {e.city}
                </p>
                <p className="inline-flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5" /> {e.event_guests?.[0]?.count ?? 0} invitados
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
