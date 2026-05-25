import Link from "next/link";
import { ChevronLeft, ChevronRight, Plus, Clock, Check } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRep } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { ActivityViewTabs } from "@/components/activities/ActivityViewTabs";
import { CalendarMonth, type CalItem } from "@/components/activities/CalendarMonth";
import {
  buildRepColors,
  STATUS_SWATCH,
  TASK_SWATCH,
  TASK_DONE_SWATCH,
  type Swatch,
} from "@/lib/colors";

export const metadata = { title: "Calendario — TERAVINO CRM" };

function pad(n: number) {
  return String(n).padStart(2, "0");
}

const FALLBACK: Swatch = { solid: "#9CA3AF", bg: "#F3F4F6", fg: "#374151" };

type Row = {
  id: string;
  activity_type: string | null;
  activity_date: string;
  status: string;
  next_step: string | null;
  next_step_date: string | null;
  next_step_done: boolean;
  account_id: string;
  sales_rep_id: string | null;
  accounts: { business_name: string | null } | null;
};

export default async function CalendarioPage({
  searchParams,
}: {
  searchParams: { mes?: string; rep?: string };
}) {
  const supabase = createClient();
  const rep = await getCurrentRep();
  const isAdmin = rep?.role === "admin";
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

  // Vendedores (para colorear + filtrar, solo admin).
  const repFilter = isAdmin && searchParams.rep ? searchParams.rep : null;
  const { data: repsData } = isAdmin
    ? await supabase
        .from("sales_reps")
        .select("id, full_name")
        .eq("active", true)
        .order("full_name")
    : { data: null };
  const reps = (repsData ?? []) as { id: string; full_name: string }[];
  const repColors = buildRepColors(reps.map((r) => r.id));

  let actQuery = supabase
    .from("activities")
    .select(
      "id, activity_type, activity_date, status, account_id, sales_rep_id, accounts:account_id(business_name)",
    )
    .neq("status", "cancelada")
    .gte("activity_date", `${monthStart}T00:00:00`)
    .lt("activity_date", `${nextStart}T00:00:00`);
  let taskQuery = supabase
    .from("activities")
    .select(
      "id, next_step, next_step_date, next_step_done, account_id, sales_rep_id, accounts:account_id(business_name)",
    )
    .not("next_step", "is", null)
    .gte("next_step_date", monthStart)
    .lt("next_step_date", nextStart);
  if (repFilter) {
    actQuery = actQuery.eq("sales_rep_id", repFilter);
    taskQuery = taskQuery.eq("sales_rep_id", repFilter);
  }
  const [activitiesRes, tasksRes] = await Promise.all([actQuery, taskQuery]);

  const itemsByDay: Record<string, CalItem[]> = {};
  const push = (day: string, item: CalItem) => {
    (itemsByDay[day] ??= []).push(item);
  };

  for (const a of (activitiesRes.data ?? []) as unknown as Row[]) {
    const day = a.activity_date.slice(0, 10);
    const time = new Date(a.activity_date).toLocaleTimeString("es-MX", {
      hour: "2-digit",
      minute: "2-digit",
    });
    // Admin: color por vendedor. Vendedor: color por estado.
    const sw = isAdmin
      ? (a.sales_rep_id && repColors[a.sales_rep_id]) || FALLBACK
      : STATUS_SWATCH[a.status] ?? FALLBACK;
    push(day, {
      id: `a-${a.id}`,
      kind: "activity",
      time,
      status: a.status,
      title: a.accounts?.business_name ?? a.activity_type ?? "actividad",
      bg: sw.bg,
      fg: sw.fg,
      href: `/cuentas/${a.account_id}`,
    });
  }

  for (const t of (tasksRes.data ?? []) as unknown as Row[]) {
    if (!t.next_step_date) continue;
    const sw = t.next_step_done ? TASK_DONE_SWATCH : TASK_SWATCH;
    push(t.next_step_date.slice(0, 10), {
      id: `t-${t.id}`,
      kind: "task",
      title: t.next_step ?? "siguiente paso",
      done: t.next_step_done,
      bg: sw.bg,
      fg: sw.fg,
      href: `/cuentas/${t.account_id}`,
    });
  }

  for (const day of Object.keys(itemsByDay)) {
    itemsByDay[day].sort((x, y) => {
      if (x.kind !== y.kind) return x.kind === "activity" ? -1 : 1;
      return (x.time ?? "").localeCompare(y.time ?? "");
    });
  }

  const monthLabel = new Intl.DateTimeFormat("es-MX", {
    month: "long",
    year: "numeric",
  }).format(new Date(year, month - 1, 1));
  const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const keepRep = repFilter ? `&rep=${repFilter}` : "";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl">Actividades</h1>
          <p className="text-sm text-muted-foreground">
            {isAdmin
              ? "Agenda del equipo · color por vendedor."
              : "Tus visitas, llamadas y siguientes pasos en calendario."}
          </p>
        </div>
        <Button asChild>
          <Link href="/actividades/nueva?estado=agendada">
            <Plus className="mr-1 h-4 w-4" /> Agendar actividad
          </Link>
        </Button>
      </div>

      <ActivityViewTabs />

      {/* Filtro por vendedor (admin) */}
      {isAdmin && reps.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <Link
            href={`/actividades/calendario?mes=${monthStr}`}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              !repFilter
                ? "border-brand-carmesi bg-brand-carmesi text-white"
                : "border-border text-muted-foreground hover:bg-muted"
            }`}
          >
            Todos
          </Link>
          {reps.map((r) => {
            const c = repColors[r.id];
            const active = repFilter === r.id;
            return (
              <Link
                key={r.id}
                href={`/actividades/calendario?mes=${monthStr}&rep=${r.id}`}
                style={
                  active
                    ? { backgroundColor: c.solid, borderColor: c.solid, color: "#fff" }
                    : { color: c.fg, borderColor: c.bg, backgroundColor: c.bg }
                }
                className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-opacity hover:opacity-80"
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: active ? "#fff" : c.solid }}
                />
                {r.full_name.split(" ")[0]}
              </Link>
            );
          })}
        </div>
      )}

      {/* Navegación de mes */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="icon">
            <Link
              href={`/actividades/calendario?mes=${prevY}-${pad(prevM)}${keepRep}`}
              aria-label="Mes anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </Link>
          </Button>
          <Button asChild variant="outline" size="icon">
            <Link
              href={`/actividades/calendario?mes=${nextY}-${pad(nextM)}${keepRep}`}
              aria-label="Mes siguiente"
            >
              <ChevronRight className="h-4 w-4" />
            </Link>
          </Button>
          <h2 className="font-display text-xl capitalize">{monthLabel}</h2>
        </div>
        <Button asChild variant="ghost" size="sm">
          <Link href={`/actividades/calendario${repFilter ? `?rep=${repFilter}` : ""}`}>
            Hoy
          </Link>
        </Button>
      </div>

      <CalendarMonth
        year={year}
        month={month}
        itemsByDay={itemsByDay}
        today={todayStr}
        canSchedule
      />

      {/* Leyenda */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <Clock className="h-3 w-3" /> Agendada
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Check className="h-3 w-3" /> Realizada
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded" style={{ backgroundColor: TASK_SWATCH.bg }} />
          Siguiente paso
        </span>
        {isAdmin && reps.length > 0 && (
          <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="text-foreground/60">·</span>
            {reps.map((r) => (
              <span key={r.id} className="inline-flex items-center gap-1.5">
                <span
                  className="h-3 w-3 rounded-full"
                  style={{ backgroundColor: repColors[r.id]?.solid }}
                />
                {r.full_name.split(" ")[0]}
              </span>
            ))}
          </span>
        )}
      </div>
    </div>
  );
}
