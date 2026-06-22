import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRep } from "@/lib/auth";
import { canViewVisitas } from "@/lib/modules";
import { Button } from "@/components/ui/button";
import { CalendarMonth, type CalItem } from "@/components/activities/CalendarMonth";
import { dateKeyTz, formatTime } from "@/lib/utils";
import {
  ACTIVITY_TYPE_COLOR,
  ACTIVITY_TYPE_LABEL,
  type ActivityType,
} from "@/lib/visitas/constants";

export const dynamic = "force-dynamic";
export const metadata = { title: "Calendario de visitas — TERAVINO CRM" };

const EVENT_SWATCH = { bg: "#7a1220", fg: "#ffffff" };

function pad(n: number) {
  return String(n).padStart(2, "0");
}

export default async function VisitasCalendarioPage({
  searchParams,
}: {
  searchParams: { mes?: string };
}) {
  const me = await getCurrentRep();
  if (!me) redirect("/login");
  if (!canViewVisitas(me.role)) redirect("/");

  const supabase = createClient();
  const now = new Date();
  let year = now.getFullYear();
  let month = now.getMonth() + 1;
  const m = searchParams.mes?.match(/^(\d{4})-(\d{2})$/);
  if (m) {
    year = Number(m[1]);
    month = Number(m[2]);
  }

  const monthStr = `${year}-${pad(month)}`;
  const nextY = month === 12 ? year + 1 : year;
  const nextM = month === 12 ? 1 : month + 1;
  const prevY = month === 1 ? year - 1 : year;
  const prevM = month === 1 ? 12 : month - 1;
  const monthStart = `${monthStr}-01`;
  const nextStart = `${nextY}-${pad(nextM)}-01`;

  const [actsRes, eventsRes] = await Promise.all([
    supabase
      .from("visit_activities")
      .select("id, visit_id, day_date, start_time, activity_type, title, client_name")
      .gte("day_date", monthStart)
      .lt("day_date", nextStart),
    supabase
      .from("events")
      .select("id, name, start_date")
      .gte("start_date", `${monthStart}T00:00:00Z`)
      .lt("start_date", `${nextStart}T00:00:00Z`),
  ]);

  const itemsByDay: Record<string, CalItem[]> = {};
  const push = (day: string, item: CalItem) => {
    (itemsByDay[day] ??= []).push(item);
  };

  for (const a of (actsRes.data ?? []) as any[]) {
    const sw = ACTIVITY_TYPE_COLOR[a.activity_type as ActivityType] ?? ACTIVITY_TYPE_COLOR.otro;
    push(a.day_date.slice(0, 10), {
      id: `a-${a.id}`,
      kind: "activity",
      time: a.start_time ? a.start_time.slice(0, 5) : null,
      title: a.title || a.client_name || ACTIVITY_TYPE_LABEL[a.activity_type as ActivityType],
      bg: sw.bg,
      fg: sw.fg,
      href: `/visitas/${a.visit_id}`,
    });
  }

  for (const e of (eventsRes.data ?? []) as any[]) {
    push(dateKeyTz(e.start_date), {
      id: `e-${e.id}`,
      kind: "activity",
      time: formatTime(e.start_date),
      title: `🍷 ${e.name}`,
      bg: EVENT_SWATCH.bg,
      fg: EVENT_SWATCH.fg,
      href: `/eventos/${e.id}`,
    });
  }

  for (const day of Object.keys(itemsByDay)) {
    itemsByDay[day].sort((x, y) => (x.time ?? "").localeCompare(y.time ?? ""));
  }

  const monthLabel = new Intl.DateTimeFormat("es-MX", { month: "long", year: "numeric" }).format(
    new Date(year, month - 1, 1),
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl">Calendario de visitas y eventos</h1>
        <p className="text-sm text-muted-foreground">
          Actividades de visitas (por tipo) y eventos formales del mes.
        </p>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="icon">
            <Link href={`/visitas/calendario?mes=${prevY}-${pad(prevM)}`} aria-label="Mes anterior">
              <ChevronLeft className="h-4 w-4" />
            </Link>
          </Button>
          <Button asChild variant="outline" size="icon">
            <Link href={`/visitas/calendario?mes=${nextY}-${pad(nextM)}`} aria-label="Mes siguiente">
              <ChevronRight className="h-4 w-4" />
            </Link>
          </Button>
          <h2 className="font-display text-xl capitalize">{monthLabel}</h2>
        </div>
        <Button asChild variant="ghost" size="sm">
          <Link href="/visitas/calendario">Hoy</Link>
        </Button>
      </div>

      <CalendarMonth year={year} month={month} itemsByDay={itemsByDay} today={dateKeyTz(now)} />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
        {Object.entries(ACTIVITY_TYPE_LABEL).map(([k, label]) => (
          <span key={k} className="inline-flex items-center gap-1.5">
            <span
              className="h-3 w-3 rounded"
              style={{ backgroundColor: ACTIVITY_TYPE_COLOR[k as ActivityType].bg }}
            />
            {label}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded" style={{ backgroundColor: EVENT_SWATCH.bg }} /> Evento
        </span>
      </div>
    </div>
  );
}
