import Link from "next/link";
import { Plus, Clock, Check } from "lucide-react";
import { cn } from "@/lib/utils";

export type CalItem = {
  id: string;
  kind: "activity" | "task";
  title: string;
  time?: string | null;
  status?: string; // agendada | realizada | cancelada
  done?: boolean;
  bg: string;
  fg: string;
  href: string;
  /** Tipo de actividad (visita, llamada…), para el panel del día. */
  typeLabel?: string | null;
  /** Vendedor dueño, para el panel del día cuando lo ve un admin. */
  repName?: string | null;
};

const WEEKDAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

function pad(n: number) {
  return String(n).padStart(2, "0");
}

const TARGET = 2; // actividades mínimas por día laboral
/** Cuántos items caben en una celda antes del "+N más". */
const PER_CELL = 4;

export function CalendarMonth({
  year,
  month,
  itemsByDay,
  today,
  canSchedule = false,
  selectedDay,
  dayHref,
}: {
  year: number;
  month: number; // 1-12
  itemsByDay: Record<string, CalItem[]>;
  today: string; // YYYY-MM-DD
  canSchedule?: boolean;
  /** Día abierto en el panel de detalle, para resaltarlo. */
  selectedDay?: string | null;
  /** A dónde lleva hacer clic en un día. Sin esto los días no son clicables. */
  dayHref?: (dateStr: string) => string;
}) {
  const daysInMonth = new Date(year, month, 0).getDate();
  const firstWeekday = (new Date(year, month - 1, 1).getDay() + 6) % 7; // Lun=0
  const totalCells = Math.ceil((firstWeekday + daysInMonth) / 7) * 7;

  const cells: ({ day: number; dateStr: string } | null)[] = [];
  for (let i = 0; i < totalCells; i++) {
    const day = i - firstWeekday + 1;
    cells.push(
      day >= 1 && day <= daysInMonth
        ? { day, dateStr: `${year}-${pad(month)}-${pad(day)}` }
        : null,
    );
  }

  return (
    // En celular la rejilla de 7 columnas se aplasta hasta ser ilegible, así
    // que se desplaza en horizontal con un ancho mínimo usable.
    <div className="-mx-4 overflow-x-auto px-4 lg:mx-0 lg:px-0">
      <div className="min-w-[46rem] overflow-hidden rounded-xl border bg-card shadow-sm lg:min-w-0">
        <div className="grid grid-cols-7 border-b bg-muted/40 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {WEEKDAYS.map((d) => (
            <div key={d} className="py-2.5">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((cell, idx) => {
            if (!cell) {
              return (
                <div
                  key={idx}
                  className="min-h-28 border-b border-r bg-muted/10 last:border-r-0"
                />
              );
            }
            const items = itemsByDay[cell.dateStr] ?? [];
            const isToday = cell.dateStr === today;
            const isSelected = selectedDay === cell.dateStr;
            const shown = items.slice(0, PER_CELL);
            const extra = items.length - shown.length;
            // Indicador de meta: lun–sáb (weekday 0–5), solo días pasados o hoy.
            const weekday = (new Date(cell.dateStr + "T12:00:00").getDay() + 6) % 7; // Lun=0
            const isWorkday = weekday <= 5;
            const isPastOrToday = cell.dateStr <= today;
            const actCount = items.filter((i) => i.kind === "activity").length;
            const showGoal = isWorkday && isPastOrToday;
            const goalColor = actCount >= TARGET
              ? "bg-emerald-500"
              : actCount === 1
              ? "bg-amber-400"
              : "bg-red-400";
            const goalTitle = actCount >= TARGET
              ? `Meta cumplida (${actCount} actividades)`
              : actCount === 1
              ? "1 actividad — falta 1 para la meta"
              : "Sin actividades este día";

            const href = dayHref?.(cell.dateStr);
            const dayNumber = (
              <div
                className={cn(
                  "flex h-6 w-6 items-center justify-center rounded-full text-xs transition-colors",
                  isToday
                    ? "bg-brand-carmesi font-semibold text-white"
                    : isSelected
                      ? "bg-foreground font-semibold text-background"
                      : "text-muted-foreground",
                  href && !isToday && !isSelected && "hover:bg-muted hover:text-foreground",
                )}
              >
                {cell.day}
              </div>
            );

            return (
              <div
                key={idx}
                className={cn(
                  "group relative min-h-28 space-y-1 border-b border-r p-1.5 last:border-r-0",
                  isToday && "bg-brand-carmesi/5",
                  isSelected && "bg-muted/60 ring-1 ring-inset ring-foreground/20",
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    {href ? (
                      <Link
                        href={href}
                        scroll={false}
                        title={`Ver el ${cell.day} completo (${items.length})`}
                      >
                        {dayNumber}
                      </Link>
                    ) : (
                      dayNumber
                    )}
                    {showGoal && (
                      <span
                        title={goalTitle}
                        className={cn("h-2 w-2 rounded-full shrink-0", goalColor)}
                      />
                    )}
                  </div>
                  {canSchedule && (
                    <Link
                      href={`/actividades/nueva?estado=agendada&fecha=${cell.dateStr}`}
                      title="Agendar en este día"
                      className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-brand-carmesi group-hover:opacity-100"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </Link>
                  )}
                </div>
                {shown.map((it) => {
                  const cancelled = it.status === "cancelada";
                  return (
                    <Link
                      key={it.id}
                      href={it.href}
                      title={it.title}
                      style={{ backgroundColor: it.bg, color: it.fg }}
                      className={cn(
                        "flex items-center gap-1 truncate rounded px-1.5 py-0.5 text-[11px] leading-tight transition-opacity hover:opacity-80",
                        (cancelled || it.done) && "line-through opacity-70",
                      )}
                    >
                      {it.kind === "activity" && it.status === "agendada" && (
                        <Clock className="h-2.5 w-2.5 shrink-0" />
                      )}
                      {it.kind === "activity" && it.status === "realizada" && (
                        <Check className="h-2.5 w-2.5 shrink-0" />
                      )}
                      {it.kind === "task" && <span className="shrink-0">→</span>}
                      <span className="truncate">
                        {it.time ? `${it.time} ` : ""}
                        {it.title}
                      </span>
                    </Link>
                  );
                })}
                {/* Antes esto era texto muerto: los días con 20+ actividades no
                    tenían forma de abrirse. Ahora lleva al detalle del día. */}
                {extra > 0 &&
                  (href ? (
                    <Link
                      href={href}
                      scroll={false}
                      className="block rounded px-1.5 text-[11px] font-medium text-brand-carmesi hover:underline"
                    >
                      +{extra} más
                    </Link>
                  ) : (
                    <div className="px-1.5 text-[11px] text-muted-foreground">
                      +{extra} más
                    </div>
                  ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
