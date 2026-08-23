import Link from "next/link";
import { CalendarDays, CheckCircle2, CircleAlert, Info, Target } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { TableScroll } from "@/components/ui/table-scroll";
import type { WeeklyActivityGoalSnapshot } from "@/lib/activity-goals";

function dateLabel(dateKey: string, withYear = false): string {
  return new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "short",
    ...(withYear ? { year: "numeric" } : {}),
    timeZone: "UTC",
  }).format(new Date(`${dateKey}T12:00:00Z`));
}

function rangeLabel(snapshot: WeeklyActivityGoalSnapshot): string {
  return `${dateLabel(snapshot.weekStart)}–${dateLabel(snapshot.weekEnd, true)}`;
}

function ringColor(progress: number): string {
  if (progress >= 120) return "#b58a3b";
  if (progress >= 100) return "#169b62";
  if (progress >= 50) return "#d28a17";
  return "#8a8583";
}

export function ActivityGoalRing({
  snapshot,
  size = 126,
}: {
  snapshot: WeeklyActivityGoalSnapshot;
  size?: number;
}) {
  const radius = 50;
  const circumference = 2 * Math.PI * radius;
  const complete = Math.min(1, snapshot.completed / snapshot.goal);
  const planned = Math.min(1 - complete, snapshot.scheduled / snapshot.goal);
  const completeLength = circumference * complete;
  const plannedLength = circumference * planned;
  const color = ringColor(snapshot.progress);

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg
        viewBox="0 0 120 120"
        className="h-full w-full -rotate-90"
        role="img"
        aria-label={`${snapshot.completed} de ${snapshot.goal} actividades realizadas; ${snapshot.scheduled} agendadas`}
      >
        <circle cx="60" cy="60" r={radius} fill="none" stroke="#eee9e3" strokeWidth="10" />
        {plannedLength > 0 ? (
          <circle
            cx="60"
            cy="60"
            r={radius}
            fill="none"
            stroke={color}
            strokeOpacity="0.24"
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={`${plannedLength} ${circumference - plannedLength}`}
            strokeDashoffset={-completeLength}
          />
        ) : null}
        {completeLength > 0 ? (
          <circle
            cx="60"
            cy="60"
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={`${completeLength} ${circumference - completeLength}`}
          />
        ) : null}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        <span className={`font-display text-brand-tinta ${size <= 60 ? "text-sm" : "text-3xl"}`}>
          {snapshot.completed}
        </span>
        <span className={`mt-1 text-muted-foreground ${size <= 60 ? "text-[8px]" : "text-xs"}`}>
          de {snapshot.goal}
        </span>
      </div>
    </div>
  );
}

function statusBadge(snapshot: WeeklyActivityGoalSnapshot) {
  if (snapshot.status === "upcoming") return <Badge variant="warning">Inicia 7 sep</Badge>;
  if (snapshot.status === "ended") return <Badge variant="muted">Piloto finalizado</Badge>;
  if (snapshot.progress >= 120) return <Badge variant="accent">Sobresaliente</Badge>;
  if (snapshot.progress >= 100) return <Badge variant="success">Meta alcanzada</Badge>;
  return <Badge variant={snapshot.progress >= 50 ? "warning" : "muted"}>En progreso</Badge>;
}

export function WeeklyActivityGoalCard({
  snapshot,
  viewingAsAdmin = false,
}: {
  snapshot: WeeklyActivityGoalSnapshot;
  viewingAsAdmin?: boolean;
}) {
  const totalProjected = snapshot.completed + snapshot.scheduled;
  return (
    <Card className="overflow-hidden border-brand-oro/45 bg-gradient-to-br from-white to-brand-crema/50">
      <CardContent className="p-0">
        <div className="grid gap-5 p-5 sm:grid-cols-[auto_1fr] sm:items-center">
          <div className="mx-auto sm:mx-0">
            <ActivityGoalRing snapshot={snapshot} />
          </div>
          <div className="min-w-0 space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-brand-carmesi">
                  <Target className="h-4 w-4" />
                  {viewingAsAdmin ? `Ritmo de ${snapshot.repName}` : "Mi meta semanal de actividades"}
                </p>
                <h2 className="mt-1 font-display text-2xl">
                  {snapshot.status === "upcoming"
                    ? `${snapshot.goal} actividades calificadas por semana`
                    : snapshot.remaining > 0
                      ? `Faltan ${snapshot.remaining} para la meta`
                      : "¡Meta semanal alcanzada!"}
                </h2>
              </div>
              {statusBadge(snapshot)}
            </div>

            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <CalendarDays className="h-4 w-4 shrink-0" /> Semana {rangeLabel(snapshot)}
            </p>

            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg border bg-white px-2 py-2">
                <p className="font-display text-xl text-emerald-700">{snapshot.completed}</p>
                <p className="text-[11px] text-muted-foreground">realizadas</p>
              </div>
              <div className="rounded-lg border bg-white px-2 py-2">
                <p className="font-display text-xl text-brand-oro">{snapshot.scheduled}</p>
                <p className="text-[11px] text-muted-foreground">agendadas</p>
              </div>
              <div className="rounded-lg border bg-white px-2 py-2">
                <p className="font-display text-xl">{snapshot.distinctAccounts}</p>
                <p className="text-[11px] text-muted-foreground">cuentas</p>
              </div>
            </div>

            {snapshot.status === "upcoming" ? (
              <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                Del 1 al 4 de septiembre será preparación. El conteo formal comienza el lunes 7.
                Ya puedes agendar; el tramo claro del círculo muestra lo que tienes planeado.
              </p>
            ) : totalProjected < snapshot.goal ? (
              <p className="text-sm text-muted-foreground">
                Con lo realizado y lo agendado llevas {totalProjected} de {snapshot.goal}. Agenda al
                menos {snapshot.goal - totalProjected} más para cubrir la semana.
              </p>
            ) : (
              <p className="flex items-center gap-2 text-sm text-emerald-700">
                <CheckCircle2 className="h-4 w-4" /> Tu agenda ya cubre la meta; falta completar y documentar.
              </p>
            )}
          </div>
        </div>

        {(snapshot.breakdown.length > 0 || snapshot.unqualified > 0) && (
          <div className="flex flex-wrap items-center gap-2 border-t bg-white/70 px-5 py-3 text-xs">
            {snapshot.breakdown.map((item) => (
              <span key={item.type} className="rounded-full bg-muted px-2.5 py-1">
                {item.label} {item.count}
              </span>
            ))}
            {snapshot.unqualified > 0 ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-amber-800">
                <CircleAlert className="h-3.5 w-3.5" /> {snapshot.unqualified} sin resultado; no suma
              </span>
            ) : null}
          </div>
        )}

        <details className="border-t px-5 py-3 text-xs text-muted-foreground">
          <summary className="cursor-pointer font-medium text-foreground">¿Qué actividad sí cuenta?</summary>
          <p className="mt-2 leading-relaxed">
            Debe estar vinculada a una cuenta, marcada como realizada y tener un resultado o siguiente
            paso. Las citas solo agendadas, canceladas o sin resultado no suman. Llamadas, correos y
            WhatsApp repetidos a la misma cuenta el mismo día cuentan como un solo seguimiento.
          </p>
        </details>
      </CardContent>
    </Card>
  );
}

export function TeamWeeklyActivityGoals({
  snapshots,
  warning,
}: {
  snapshots: WeeklyActivityGoalSnapshot[];
  warning?: string | null;
}) {
  if (!snapshots.length && !warning) return null;
  return (
    <Card className="overflow-hidden border-brand-oro/45">
      <CardContent className="p-0">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b bg-gradient-to-r from-brand-carmesi/[0.06] to-brand-oro/[0.10] p-4">
          <div>
            <h2 className="flex items-center gap-2 font-display text-lg">
              <Target className="h-5 w-5 text-brand-carmesi" /> Metas semanales de actividad
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Vista de Dirección · solo actividades realizadas con resultado documentado
            </p>
          </div>
          <Badge variant="accent">Piloto 7 sep–4 oct</Badge>
        </div>

        {warning ? (
          <p className="flex items-start gap-2 border-b bg-amber-50 p-3 text-xs text-amber-800">
            <Info className="mt-0.5 h-4 w-4 shrink-0" /> {warning}
          </p>
        ) : null}

        <TableScroll className="rounded-none border-0">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left">Vendedor</th>
                <th className="px-4 py-2 text-center">Avance</th>
                <th className="px-4 py-2 text-right">Realizadas / meta</th>
                <th className="px-4 py-2 text-right">Agendadas</th>
                <th className="px-4 py-2 text-right">Cuentas</th>
                <th className="px-4 py-2 text-left">Últimas semanas</th>
              </tr>
            </thead>
            <tbody>
              {snapshots.map((snapshot) => (
                <tr key={snapshot.repId} className="border-t hover:bg-muted/20">
                  <td className="px-4 py-2.5 font-medium">
                    <Link href={`/actividades/hoy?rep=${snapshot.repId}`} className="hover:text-brand-carmesi">
                      {snapshot.repName}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="mx-auto w-12">
                      <ActivityGoalRing snapshot={snapshot} size={48} />
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    <span className="font-semibold">{snapshot.completed}</span> / {snapshot.goal}
                    <div className="text-[11px] text-muted-foreground">{Math.round(snapshot.progress)}%</div>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{snapshot.scheduled}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{snapshot.distinctAccounts}</td>
                  <td className="px-4 py-2.5">
                    {snapshot.status !== "upcoming" && snapshot.history.length ? (
                      <div className="flex gap-1.5">
                        {snapshot.history.map((week) => (
                          <span
                            key={week.weekStart}
                            title={`${dateLabel(week.weekStart)}: ${week.completed}/${snapshot.goal}`}
                            className={`flex h-7 min-w-7 items-center justify-center rounded-full px-1 text-[11px] font-medium ${
                              week.reached
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-muted text-muted-foreground"
                            }`}
                          >
                            {week.completed}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">Inicia 7 sep</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      </CardContent>
    </Card>
  );
}
