import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus, CalendarClock, MapPin, CalendarDays } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRep } from "@/lib/auth";
import { canViewVisitas } from "@/lib/modules";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate } from "@/lib/utils";
import {
  VISIT_STATUS_BADGE,
  VISIT_STATUS_LABEL,
  type VisitStatus,
} from "@/lib/visitas/constants";

export const dynamic = "force-dynamic";
export const metadata = { title: "Visitas de proveedor — TERAVINO CRM" };

type Row = {
  id: string;
  provider_name: string;
  winery_brand: string | null;
  arrival_date: string;
  departure_date: string;
  city: string;
  status: VisitStatus;
  coordinator: { full_name: string | null } | null;
  visit_activities: { count: number }[];
};

export default async function VisitasPage() {
  const me = await getCurrentRep();
  if (!me) redirect("/login");
  if (!canViewVisitas(me.role)) redirect("/");
  const isAdmin = me.role === "admin";

  const supabase = createClient();
  const { data } = await supabase
    .from("supplier_visits")
    .select(
      "id, provider_name, winery_brand, arrival_date, departure_date, city, status, coordinator:coordinator_id(full_name), visit_activities(count)",
    )
    .order("arrival_date", { ascending: false });

  const rows = (data ?? []) as unknown as Row[];
  const activos = rows.filter((r) => r.status !== "completed" && r.status !== "cancelled");
  const cerrados = rows.filter((r) => r.status === "completed" || r.status === "cancelled");

  const Card = (r: Row) => (
    <Link
      key={r.id}
      href={`/visitas/${r.id}`}
      className="block rounded-xl border bg-card p-4 shadow-sm transition-colors hover:border-brand-carmesi/40"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-display text-lg">{r.provider_name}</h3>
          {r.winery_brand && (
            <p className="text-sm text-muted-foreground">{r.winery_brand}</p>
          )}
        </div>
        <Badge variant={VISIT_STATUS_BADGE[r.status]}>{VISIT_STATUS_LABEL[r.status]}</Badge>
      </div>
      <div className="mt-3 space-y-1 text-sm text-muted-foreground">
        <p className="inline-flex items-center gap-1.5">
          <CalendarDays className="h-3.5 w-3.5" />
          {formatDate(r.arrival_date)} – {formatDate(r.departure_date)}
        </p>
        <p className="inline-flex items-center gap-1.5">
          <MapPin className="h-3.5 w-3.5" /> {r.city}
        </p>
        <p className="inline-flex items-center gap-1.5">
          <CalendarClock className="h-3.5 w-3.5" />
          {r.visit_activities?.[0]?.count ?? 0} actividades
          {r.coordinator?.full_name ? ` · ${r.coordinator.full_name}` : ""}
        </p>
      </div>
    </Link>
  );

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl">Visitas de proveedor</h1>
          <p className="text-sm text-muted-foreground">
            Fechas en que nos visita un proveedor/bodega y la agenda con clientes.
          </p>
        </div>
        {isAdmin && (
          <Button asChild>
            <Link href="/visitas/nueva">
              <Plus className="mr-1 h-4 w-4" /> Nueva visita
            </Link>
          </Button>
        )}
      </header>

      {rows.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title="Sin visitas registradas"
          description="Cuando un proveedor confirme fechas, regístralo aquí para agendar las actividades con clientes."
          action={
            isAdmin ? (
              <Button asChild>
                <Link href="/visitas/nueva">
                  <Plus className="mr-1 h-4 w-4" /> Nueva visita
                </Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          {activos.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Próximas / en curso
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{activos.map(Card)}</div>
            </section>
          )}
          {cerrados.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Completadas / canceladas
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{cerrados.map(Card)}</div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
