import Link from "next/link";
import { Check, Clock, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CalItem } from "@/components/activities/CalendarMonth";

/**
 * El mes completo como lista, día por día. No oculta nada (la rejilla recorta
 * a cuatro por celda) y es la única forma cómoda de leer el calendario en un
 * celular, donde siete columnas no caben.
 */
export function CalendarAgenda({
  year,
  month,
  itemsByDay,
  today,
  canSchedule = false,
  showRep = false,
}: {
  year: number;
  month: number; // 1-12
  itemsByDay: Record<string, CalItem[]>;
  today: string;
  canSchedule?: boolean;
  showRep?: boolean;
}) {
  const monthStr = `${year}-${String(month).padStart(2, "0")}`;
  // Solo los días del mes que tienen algo: una lista con 20 días vacíos no
  // ayuda a nadie.
  const dias = Object.keys(itemsByDay)
    .filter((d) => d.startsWith(monthStr) && (itemsByDay[d]?.length ?? 0) > 0)
    .sort();

  if (!dias.length) {
    return (
      <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
        No hay actividades ni tareas este mes.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {dias.map((d) => {
        const items = itemsByDay[d] ?? [];
        const isToday = d === today;
        const label = new Intl.DateTimeFormat("es-MX", {
          weekday: "long",
          day: "numeric",
          month: "long",
        }).format(new Date(`${d}T12:00:00`));

        return (
          <section key={d} className="overflow-hidden rounded-xl border bg-card shadow-sm">
            <div
              className={cn(
                "flex items-center justify-between gap-2 border-b px-4 py-2",
                isToday ? "bg-brand-carmesi/10" : "bg-muted/40",
              )}
            >
              <div className="flex items-center gap-2">
                <h3
                  className={cn(
                    "font-display text-base capitalize",
                    isToday && "text-brand-carmesi",
                  )}
                >
                  {label}
                </h3>
                {isToday && (
                  <span className="rounded-full bg-brand-carmesi px-2 py-0.5 text-[11px] font-medium text-white">
                    Hoy
                  </span>
                )}
                <span className="rounded-full bg-background px-2 py-0.5 text-xs text-muted-foreground">
                  {items.length}
                </span>
              </div>
              {canSchedule && (
                <Link
                  href={`/actividades/nueva?estado=agendada&fecha=${d}`}
                  title="Agendar en este día"
                  className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-brand-carmesi"
                >
                  <Plus className="h-3.5 w-3.5" />
                </Link>
              )}
            </div>

            <div className="divide-y">
              {items.map((it) => {
                const cancelled = it.status === "cancelada";
                const tachado = cancelled || it.done;
                return (
                  <Link
                    key={it.id}
                    href={it.href}
                    className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/50"
                  >
                    <span
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs"
                      style={{ backgroundColor: it.bg, color: it.fg }}
                    >
                      {it.kind === "task" ? (
                        "→"
                      ) : it.status === "realizada" ? (
                        <Check className="h-3.5 w-3.5" />
                      ) : (
                        <Clock className="h-3.5 w-3.5" />
                      )}
                    </span>
                    <span className="w-16 shrink-0 text-xs tabular-nums text-muted-foreground">
                      {it.time ?? "—"}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span
                        className={cn(
                          "block truncate text-sm",
                          tachado && "line-through opacity-70",
                        )}
                      >
                        {it.title}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {[
                          it.typeLabel,
                          it.kind === "activity" && it.status === "agendada"
                            ? "agendada"
                            : null,
                          cancelled ? "cancelada" : null,
                          it.kind === "task" && it.done ? "hecha" : null,
                          showRep ? it.repName : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                  </Link>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
