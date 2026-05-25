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
};

const WEEKDAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

function pad(n: number) {
  return String(n).padStart(2, "0");
}

export function CalendarMonth({
  year,
  month,
  itemsByDay,
  today,
  canSchedule = false,
}: {
  year: number;
  month: number; // 1-12
  itemsByDay: Record<string, CalItem[]>;
  today: string; // YYYY-MM-DD
  canSchedule?: boolean;
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
    <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
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
          const shown = items.slice(0, 3);
          const extra = items.length - shown.length;
          return (
            <div
              key={idx}
              className={cn(
                "group relative min-h-28 space-y-1 border-b border-r p-1.5 last:border-r-0",
                isToday && "bg-brand-carmesi/5",
              )}
            >
              <div className="flex items-center justify-between">
                <div
                  className={cn(
                    "flex h-6 w-6 items-center justify-center rounded-full text-xs",
                    isToday
                      ? "bg-brand-carmesi font-semibold text-white"
                      : "text-muted-foreground",
                  )}
                >
                  {cell.day}
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
              {extra > 0 && (
                <div className="px-1.5 text-[11px] text-muted-foreground">
                  +{extra} más
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
