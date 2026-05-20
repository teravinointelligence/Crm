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
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h2 className="font-display text-xl">{MESES[month]} {year}</h2>
            {!loading && (
              <span className="text-xs text-muted-foreground">
                {totalRealizadas} realizadas · {totalProximos} próximas
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {isAdmin && reps.length > 0 && (
              <Select value={repFilter} onValueChange={setRepFilter}>
                <SelectTrigger className="h-8 w-44 text-xs">
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
            <Button variant="outline" size="sm" onClick={goToday}>Hoy</Button>
            <Button variant="ghost" size="icon" onClick={goPrev} aria-label="Mes anterior">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={goNext} aria-label="Mes siguiente">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Leyenda */}
        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full bg-brand-carmesi" /> Realizada
          </span>
          <span className="flex items-center gap-1">
            <Flag className="h-3 w-3 text-amber-600" /> Próximo paso
          </span>
        </div>

        {error ? (
          <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>
        ) : (
          <>
            <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">
              {DIAS.map((d) => <div key={d} className="py-1 font-medium">{d}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {cells.map((day, i) => {
                if (day === null) return <div key={`pad-${i}`} />;
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
                    className={[
                      "flex min-h-[3.5rem] flex-col items-start gap-1 rounded-md border p-1.5 text-left transition",
                      isSelected ? "border-brand-carmesi ring-1 ring-brand-carmesi" : "hover:border-brand-carmesi/50",
                      isToday ? "bg-brand-carmesi/5" : "",
                      events.length ? "" : "opacity-60",
                    ].join(" ")}
                  >
                    <span className={`text-xs ${isToday ? "font-bold text-brand-carmesi" : ""}`}>{day}</span>
                    <div className="flex flex-wrap gap-0.5">
                      {realizadas > 0 && (
                        <span className="flex h-4 items-center gap-0.5 rounded-full bg-brand-carmesi px-1 text-[10px] font-medium text-white">
                          {realizadas}
                        </span>
                      )}
                      {proximos > 0 && (
                        <span className="flex h-4 items-center gap-0.5 rounded-full bg-amber-100 px-1 text-[10px] font-medium text-amber-800">
                          <Flag className="h-2.5 w-2.5" />{proximos}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        )}

        {/* Panel del día seleccionado */}
        {selectedDay && (
          <div className="space-y-2 rounded-md border bg-muted/20 p-3">
            <h3 className="text-sm font-medium">
              {(() => {
                const [yy, mm, dd] = selectedDay.split("-").map(Number);
                return `${dd} de ${MESES[mm - 1]} ${yy}`;
              })()}
            </h3>
            {selectedEvents.length === 0 ? (
              <p className="text-xs text-muted-foreground">Sin actividades este día.</p>
            ) : (
              <ul className="space-y-1.5">
                {selectedEvents.map((e, idx) => {
                  const a = e.activity;
                  const Icon = TYPE_ICON[a.activity_type ?? "visita"] ?? CalendarCheck2;
                  return (
                    <li key={`${a.id}-${e.kind}-${idx}`}>
                      <Link
                        href={`/cuentas/${a.account_id}?tab=actividades`}
                        className="flex items-start gap-2 rounded-md border bg-card p-2 text-sm hover:border-brand-carmesi"
                      >
                        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-brand-carmesi" />
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium">{a.accounts?.business_name ?? "—"}</span>
                            {e.kind === "proximo" ? (
                              <Badge variant="warning">Próximo paso</Badge>
                            ) : (
                              <Badge variant="muted">{TYPE_LABEL[a.activity_type ?? "visita"] ?? "Actividad"}</Badge>
                            )}
                            {isAdmin && repFilter === "all" && a.sales_reps?.full_name && (
                              <Badge variant="accent">{a.sales_reps.full_name.split(" ")[0]}</Badge>
                            )}
                          </div>
                          <p className="truncate text-xs text-muted-foreground">
                            {e.kind === "proximo"
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
