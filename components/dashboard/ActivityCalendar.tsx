"use client";

// Calendario mensual de actividades del vendedor para el dashboard.
// Carga las actividades del mes vía /api/activities/calendar y las ubica en
// la cuadrícula. Cada actividad genera hasta 2 marcas:
//   - "realizada" en su activity_date
//   - "próximo paso" en su next_step_date (si existe)
// Click en un día → panel inferior con el detalle de ese día.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  CalendarCheck2,
  Phone,
  Mail,
  MessageCircle,
  Wine,
  Users,
  Calendar as CalendarIcon,
  Flag,
  Check,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

type ApiActivity = {
  id: string;
  activity_type: string | null;
  activity_date: string;
  next_step: string | null;
  next_step_date: string | null;
  outcome: string | null;
  notes: string | null;
  account_id: string;
  sales_rep_id: string | null;
  accounts: { business_name: string | null } | null;
  sales_reps: { full_name: string | null } | null;
};

type RepOption = { id: string; full_name: string };

type DayEvent = {
  kind: "realizada" | "proximo";
  activity: ApiActivity;
};

const TYPE_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  visita: CalendarCheck2,
  llamada: Phone,
  email: Mail,
  whatsapp: MessageCircle,
  degustacion: Wine,
  reunion: Users,
  evento: CalendarIcon,
};

const TYPE_LABEL: Record<string, string> = {
  visita: "Visita",
  llamada: "Llamada",
  email: "Email",
  whatsapp: "WhatsApp",
  degustacion: "Degustación",
  reunion: "Reunión",
  evento: "Evento",
};

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];
const DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Lunes=0 ... Domingo=6 para alinear con el header DIAS. */
function mondayIndex(jsDay: number) {
  return (jsDay + 6) % 7;
}

export function ActivityCalendar({
  isAdmin = false,
  reps = [],
}: {
  isAdmin?: boolean;
  reps?: RepOption[];
}) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth()); // 0-11
  const [repFilter, setRepFilter] = useState<string>("all"); // admin: "all" | rep id
  const [activities, setActivities] = useState<ApiActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const monthParam = `${year}-${String(month + 1).padStart(2, "0")}`;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setSelectedDay(null);
    (async () => {
      try {
        const repQ = isAdmin ? `&rep=${encodeURIComponent(repFilter)}` : "";
        const res = await fetch(`/api/activities/calendar?month=${monthParam}${repQ}`);
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          if (!cancelled) setError(d.error ?? `HTTP ${res.status}`);
          return;
        }
        const { data } = (await res.json()) as { data: ApiActivity[] };
        if (!cancelled) setActivities(data);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Error al cargar");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [monthParam, repFilter, isAdmin]);

  // Agrupa eventos por día (YYYY-MM-DD).
  const eventsByDay = useMemo(() => {
    const map = new Map<string, DayEvent[]>();
    const inMonth = (iso: string) => iso.slice(0, 7) === monthParam;
    for (const a of activities) {
      const actDay = a.activity_date.slice(0, 10);
      if (inMonth(actDay)) {
        const arr = map.get(actDay) ?? [];
        arr.push({ kind: "realizada", activity: a });
        map.set(actDay, arr);
      }
      if (a.next_step_date && inMonth(a.next_step_date)) {
        const arr = map.get(a.next_step_date) ?? [];
        arr.push({ kind: "proximo", activity: a });
        map.set(a.next_step_date, arr);
      }
    }
    return map;
  }, [activities, monthParam]);

  // Construye la grilla de días (incluye padding del inicio del mes).
  const cells = useMemo(() => {
    const first = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const pad = mondayIndex(first.getDay());
    const out: (number | null)[] = [];
    for (let i = 0; i < pad; i++) out.push(null);
    for (let d = 1; d <= daysInMonth; d++) out.push(d);
    while (out.length % 7 !== 0) out.push(null);
    return out;
  }, [year, month]);

  const goPrev = () => {
    if (month === 0) { setYear((y) => y - 1); setMonth(11); }
    else setMonth((m) => m - 1);
  };
  const goNext = () => {
    if (month === 11) { setYear((y) => y + 1); setMonth(0); }
    else setMonth((m) => m + 1);
  };
  const goToday = () => {
    setYear(today.getFullYear());
    setMonth(today.getMonth());
  };

  const todayStr = ymd(today);
  const selectedEvents = selectedDay ? eventsByDay.get(selectedDay) ?? [] : [];

  const totalRealizadas = activities.filter((a) => a.activity_date.slice(0, 7) === monthParam).length;
  const totalProximos = activities.filter((a) => a.next_step_date && a.next_step_date.slice(0, 7) === monthParam).length;

  const selectedLabel = selectedDay
    ? (() => {
        const [yy, mm, dd] = selectedDay.split("-").map(Number);
        return `${dd} de ${MESES[mm - 1]} ${yy}`;
      })()
    : "";

  return (
    <Card className="overflow-hidden">
      <CardContent className="space-y-4 p-4 sm:p-5">
        {/* Encabezado */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl leading-none">
              {MESES[month]} <span className="text-muted-foreground">{year}</span>
            </h2>
            {!loading && !error && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                <span className="inline-flex items-center gap-1 rounded-full bg-brand-carmesi/10 px-2 py-0.5 font-medium text-brand-carmesi">
                  <Check className="h-3 w-3" /> {totalRealizadas} realizadas
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-800">
                  <Flag className="h-3 w-3" /> {totalProximos} próximas
                </span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            {isAdmin && reps.length > 0 && (
              <Select value={repFilter} onValueChange={setRepFilter}>
                <SelectTrigger className="h-9 w-44 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los vendedores</SelectItem>
                  {reps.map((r) => (
                    <SelectItem key={r.id} value={r.id}>{r.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <div className="flex items-center rounded-lg border bg-card p-0.5 shadow-sm">
              <button
                type="button"
                onClick={goPrev}
                aria-label="Mes anterior"
                className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={goToday}
                className="rounded-md px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted"
              >
                Hoy
              </button>
              <button
                type="button"
                onClick={goNext}
                aria-label="Mes siguiente"
                className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {error ? (
          <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>
        ) : (
          <div className="overflow-hidden rounded-xl border shadow-sm">
            {/* Cabecera de días */}
            <div className="grid grid-cols-7 border-b bg-muted/40 text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {DIAS.map((d, i) => (
                <div key={d} className={cn("py-2.5", i >= 5 && "text-brand-carmesi/60")}>
                  {d}
                </div>
              ))}
            </div>
            {/* Cuadrícula */}
            <div className={cn("grid grid-cols-7 transition-opacity", loading && "opacity-40")}>
              {cells.map((day, i) => {
                const col = i % 7;
                const weekend = col >= 5;
                if (day === null) {
                  return (
                    <div
                      key={`pad-${i}`}
                      className="min-h-[4.75rem] border-b border-r bg-muted/10 [&:nth-child(7n)]:border-r-0"
                    />
                  );
                }
                const dayStr = `${monthParam}-${String(day).padStart(2, "0")}`;
                const events = eventsByDay.get(dayStr) ?? [];
                const realizadas = events.filter((e) => e.kind === "realizada").length;
                const proximos = events.filter((e) => e.kind === "proximo").length;
                const isToday = dayStr === todayStr;
                const isSelected = dayStr === selectedDay;
                return (
                  <button
                    key={dayStr}
                    type="button"
                    onClick={() => setSelectedDay(isSelected ? null : dayStr)}
                    disabled={loading}
                    className={cn(
                      "group relative flex min-h-[4.75rem] flex-col gap-1 border-b border-r p-1.5 text-left transition-colors [&:nth-child(7n)]:border-r-0",
                      weekend && "bg-muted/15",
                      isToday && !isSelected && "bg-brand-carmesi/5",
                      isSelected && "bg-brand-carmesi/10 ring-1 ring-inset ring-brand-carmesi",
                      !loading && !isSelected && "hover:bg-brand-carmesi/5",
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-6 w-6 items-center justify-center rounded-full text-xs",
                        isToday ? "bg-brand-carmesi font-semibold text-white" : "text-foreground/70",
                      )}
                    >
                      {day}
                    </span>
                    {(realizadas > 0 || proximos > 0) && (
                      <div className="mt-auto flex flex-wrap gap-1">
                        {realizadas > 0 && (
                          <span className="inline-flex h-5 items-center gap-0.5 rounded-md bg-brand-carmesi px-1.5 text-[10px] font-semibold text-white">
                            <Check className="h-2.5 w-2.5" />
                            {realizadas}
                          </span>
                        )}
                        {proximos > 0 && (
                          <span className="inline-flex h-5 items-center gap-0.5 rounded-md bg-amber-100 px-1.5 text-[10px] font-semibold text-amber-800">
                            <Flag className="h-2.5 w-2.5" />
                            {proximos}
                          </span>
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Panel del día seleccionado */}
        {selectedDay && (
          <div className="space-y-2 rounded-xl border bg-muted/20 p-3">
            <h3 className="flex items-center gap-2 text-sm font-medium">
              <CalendarIcon className="h-4 w-4 text-brand-carmesi" />
              {selectedLabel}
              <span className="ml-auto text-xs font-normal text-muted-foreground">
                {selectedEvents.length} {selectedEvents.length === 1 ? "actividad" : "actividades"}
              </span>
            </h3>
            {selectedEvents.length === 0 ? (
              <p className="text-xs text-muted-foreground">Sin actividades este día.</p>
            ) : (
              <ul className="space-y-1.5">
                {selectedEvents.map((e, idx) => {
                  const a = e.activity;
                  const Icon = TYPE_ICON[a.activity_type ?? "visita"] ?? CalendarCheck2;
                  const proximo = e.kind === "proximo";
                  return (
                    <li key={`${a.id}-${e.kind}-${idx}`}>
                      <Link
                        href={`/cuentas/${a.account_id}?tab=actividades`}
                        className="flex items-stretch gap-2.5 overflow-hidden rounded-lg border bg-card text-sm transition-colors hover:border-brand-carmesi"
                      >
                        <span
                          className={cn("w-1 shrink-0", proximo ? "bg-amber-400" : "bg-brand-carmesi")}
                          aria-hidden
                        />
                        <span
                          className={cn(
                            "mt-2 flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
                            proximo ? "bg-amber-100 text-amber-700" : "bg-brand-carmesi/10 text-brand-carmesi",
                          )}
                        >
                          <Icon className="h-4 w-4" />
                        </span>
                        <div className="min-w-0 flex-1 py-2 pr-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium">{a.accounts?.business_name ?? "—"}</span>
                            {proximo ? (
                              <Badge variant="warning">Próximo paso</Badge>
                            ) : (
                              <Badge variant="muted">{TYPE_LABEL[a.activity_type ?? "visita"] ?? "Actividad"}</Badge>
                            )}
                            {isAdmin && repFilter === "all" && a.sales_reps?.full_name && (
                              <Badge variant="accent">{a.sales_reps.full_name.split(" ")[0]}</Badge>
                            )}
                          </div>
                          <p className="truncate text-xs text-muted-foreground">
                            {proximo
                              ? (a.next_step ?? "Seguimiento pendiente")
                              : (a.outcome ?? a.notes ?? TYPE_LABEL[a.activity_type ?? "visita"])}
                          </p>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
