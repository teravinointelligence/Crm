import {
  Phone,
  Mail,
  MessageCircle,
  Wine,
  Users,
  Calendar,
  CalendarCheck2,
  CircleAlert,
  CircleCheckBig,
} from "lucide-react";
import { formatDate, formatDateTime } from "@/lib/utils";
import { EmptyState } from "@/components/ui/empty-state";
import type { Activity } from "@/types/database";

const iconFor: Record<string, React.ComponentType<{ className?: string }>> = {
  visita: CalendarCheck2,
  llamada: Phone,
  email: Mail,
  whatsapp: MessageCircle,
  degustacion: Wine,
  reunion: Users,
  evento: Calendar,
};

export function ActivityTimeline({
  activities,
  showAccount = false,
}: {
  activities: (Activity & {
    accounts?: { business_name: string | null } | null;
  })[];
  showAccount?: boolean;
}) {
  if (!activities.length) {
    return (
      <EmptyState
        title="Sin actividades"
        description="Cuando registres visitas, llamadas o eventos aparecerán aquí."
        icon={CalendarCheck2}
      />
    );
  }

  return (
    <ol className="relative space-y-4 border-l border-border pl-6">
      {activities.map((a) => {
        const Icon = iconFor[a.activity_type ?? "visita"] ?? CalendarCheck2;
        const done = a.next_step_done;
        const overdue =
          !done && a.next_step_date && new Date(a.next_step_date) < new Date();
        return (
          <li key={a.id} className="relative">
            <span className="absolute -left-[34px] top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-brand-carmesi text-white">
              <Icon className="h-3.5 w-3.5" />
            </span>
            <div className="rounded-lg border bg-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium capitalize">
                    {a.activity_type ?? "actividad"}
                  </span>
                  {a.status === "agendada" && (
                    <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-medium text-indigo-700">
                      Agendada
                    </span>
                  )}
                  {a.status === "cancelada" && (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                      Cancelada
                    </span>
                  )}
                  {showAccount && a.accounts?.business_name && (
                    <span className="text-muted-foreground">
                      · {a.accounts.business_name}
                    </span>
                  )}
                  <span className="text-muted-foreground">
                    · {formatDateTime(a.activity_date)}
                  </span>
                </div>
                {a.duration_minutes && (
                  <span className="text-xs text-muted-foreground">
                    {a.duration_minutes} min
                  </span>
                )}
              </div>
              {a.outcome && (
                <p className="mt-2 text-sm text-foreground/90">{a.outcome}</p>
              )}
              {a.next_step && (
                <div
                  className={
                    done
                      ? "mt-3 flex items-start gap-2 rounded-md bg-emerald-50 p-3 text-sm"
                      : "mt-3 flex items-start gap-2 rounded-md bg-accent/15 p-3 text-sm"
                  }
                >
                  {done ? (
                    <CircleCheckBig className="h-4 w-4 text-emerald-600" />
                  ) : (
                    <CircleAlert
                      className={
                        overdue ? "h-4 w-4 text-red-600" : "h-4 w-4 text-brand-carmesi"
                      }
                    />
                  )}
                  <div>
                    <div
                      className={
                        done
                          ? "font-medium text-muted-foreground line-through"
                          : "font-medium"
                      }
                    >
                      {done ? "Hecho: " : "Siguiente: "}
                      {a.next_step}
                    </div>
                    {a.next_step_date && (
                      <div
                        className={
                          overdue
                            ? "text-xs text-red-600"
                            : "text-xs text-muted-foreground"
                        }
                      >
                        {formatDate(a.next_step_date)}
                        {overdue ? " · vencida" : ""}
                      </div>
                    )}
                  </div>
                </div>
              )}
              {a.notes && (
                <p className="mt-2 border-t pt-2 text-xs text-muted-foreground">
                  {a.notes}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
