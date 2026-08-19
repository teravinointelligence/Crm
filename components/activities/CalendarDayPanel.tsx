import Link from "next/link";
import { Check, Clock, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CalItem } from "@/components/activities/CalendarMonth";

/**
 * Todo lo de un día, sin recortes. La celda del calendario solo alcanza para
 * cuatro renglones; este panel es el que responde "¿qué más había ese día?".
 */
export function CalendarDayPanel({
  day,
  items,
  closeHref,
  canSchedule = false,
  showRep = false,
}: {
  day: string; // YYYY-MM-DD
  items: CalItem[];
  closeHref: string;
  canSchedule?: boolean;
  /** El admin ve de quién es cada actividad. */
  showRep?: boolean;
}) {
  const label = new Intl.DateTimeFormat("es-MX", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(`${day}T12:00:00`));

  const actividades = items.filter((i) => i.kind === "activity");
  const tareas = items.filter((i) => i.kind === "task");

  return (
    <div className="rounded-xl border bg-card shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <h3 className="font-display text-lg capitalize">{label}</h3>
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            {items.length}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {canSchedule && (
            <Link
              href={`/actividades/nueva?estado=agendada&fecha=${day}`}
              className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium hover:bg-muted"
            >
              <Plus className="h-3.5 w-3.5" /> Agendar
            </Link>
          )}
          <Link
            href={closeHref}
            scroll={false}
            aria-label="Cerrar el detalle del día"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </Link>
        </div>
      </div>

      {items.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-muted-foreground">
          Nada agendado este día.
        </p>
      ) : (
        <div className="divide-y">
          {actividades.map((it) => (
            <Row key={it.id} item={it} showRep={showRep} />
          ))}
          {tareas.length > 0 && (
            <>
              <div className="bg-muted/40 px-4 py-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Siguientes pasos
              </div>
              {tareas.map((it) => (
                <Row key={it.id} item={it} showRep={showRep} />
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Row({ item, showRep }: { item: CalItem; showRep: boolean }) {
  const cancelled = item.status === "cancelada";
  const tachado = cancelled || item.done;
  return (
    <Link
      href={item.href}
      className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/50"
    >
      <span
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs"
        style={{ backgroundColor: item.bg, color: item.fg }}
      >
        {item.kind === "task" ? (
          "→"
        ) : item.status === "realizada" ? (
          <Check className="h-3.5 w-3.5" />
        ) : (
          <Clock className="h-3.5 w-3.5" />
        )}
      </span>

      <span className="w-16 shrink-0 text-xs tabular-nums text-muted-foreground">
        {item.time ?? "—"}
      </span>

      <span className="min-w-0 flex-1">
        <span className={cn("block truncate text-sm", tachado && "line-through opacity-70")}>
          {item.title}
        </span>
        <span className="block truncate text-xs text-muted-foreground">
          {[
            item.typeLabel,
            item.kind === "activity" && item.status === "agendada" ? "agendada" : null,
            cancelled ? "cancelada" : null,
            item.kind === "task" && item.done ? "hecha" : null,
            showRep ? item.repName : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </span>
    </Link>
  );
}
