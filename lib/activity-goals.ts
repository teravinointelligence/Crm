export const ACTIVITY_GOAL_PILOT_START = "2026-09-07";
export const ACTIVITY_GOAL_PILOT_END = "2026-10-04";

export type ActivityGoalStatus = "upcoming" | "active" | "ended";

export type ActivityGoalSourceRow = {
  id: string;
  sales_rep_id: string | null;
  account_id: string;
  activity_type: string | null;
  activity_date: string;
  completed_at: string | null;
  status: string;
  outcome: string | null;
  next_step: string | null;
};

export type ActivityGoalHistory = {
  weekStart: string;
  weekEnd: string;
  completed: number;
  reached: boolean;
};

export type WeeklyActivityGoalSnapshot = {
  repId: string;
  repName: string;
  goal: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  status: ActivityGoalStatus;
  weekStart: string;
  weekEnd: string;
  completed: number;
  scheduled: number;
  unqualified: number;
  distinctAccounts: number;
  remaining: number;
  progress: number;
  breakdown: Array<{ type: string; label: string; count: number }>;
  history: ActivityGoalHistory[];
};

function activityDateKey(value: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "America/Mazatlan",
  }).format(new Date(value));
}

function dateOffset(dateKey: string, days: number): string {
  const date = new Date(`${dateKey}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function mondayOf(dateKey: string): string {
  const date = new Date(`${dateKey}T12:00:00Z`);
  const isoDay = date.getUTCDay() || 7;
  return dateOffset(dateKey, 1 - isoDay);
}

export function activityGoalStatus(
  todayKey: string,
  effectiveFrom: string,
  effectiveTo: string | null,
): ActivityGoalStatus {
  if (todayKey < effectiveFrom) return "upcoming";
  if (effectiveTo && todayKey > effectiveTo) return "ended";
  return "active";
}

function selectedWeek(
  todayKey: string,
  effectiveFrom: string,
  effectiveTo: string | null,
): string {
  const status = activityGoalStatus(todayKey, effectiveFrom, effectiveTo);
  if (status === "upcoming") return effectiveFrom;
  if (status === "ended" && effectiveTo) return mondayOf(effectiveTo);
  return mondayOf(todayKey);
}

function meaningful(value: string | null): boolean {
  return Boolean(value?.trim());
}

export function isQualifiedActivity(activity: ActivityGoalSourceRow): boolean {
  return (
    activity.status === "realizada" &&
    Boolean(activity.account_id) &&
    (meaningful(activity.outcome) || meaningful(activity.next_step))
  );
}

const TYPE_LABELS: Record<string, string> = {
  visita: "Visitas",
  reunion: "Reuniones",
  degustacion: "Degustaciones",
  evento: "Eventos",
  llamada: "Llamadas",
  email: "Correos",
  whatsapp: "WhatsApp",
  otro: "Otras",
};

function normalizedType(value: string | null): string {
  const type = value?.trim().toLowerCase() || "otro";
  return TYPE_LABELS[type] ? type : "otro";
}

function completionDate(activity: ActivityGoalSourceRow): string {
  return activityDateKey(activity.completed_at ?? activity.activity_date);
}

function dedupeKey(activity: ActivityGoalSourceRow, mode: "completed" | "scheduled"): string {
  const type = normalizedType(activity.activity_type);
  const day = activityDateKey(
    mode === "completed" ? activity.completed_at ?? activity.activity_date : activity.activity_date,
  );
  // Un correo, WhatsApp y llamada rutinarios a la misma cuenta el mismo día
  // forman un solo seguimiento. Las visitas y reuniones siguen siendo eventos separados.
  if (["llamada", "email", "whatsapp"].includes(type)) {
    return `${activity.account_id}:${day}:seguimiento`;
  }
  return activity.id;
}

function rowsForWeek(
  activities: ActivityGoalSourceRow[],
  weekStart: string,
  weekEnd: string,
) {
  const realized = activities.filter(
    (activity) =>
      activity.status === "realizada" &&
      completionDate(activity) >= weekStart &&
      completionDate(activity) <= weekEnd,
  );
  const qualified = realized.filter(isQualifiedActivity);
  const completed = Array.from(
    new Map(qualified.map((activity) => [dedupeKey(activity, "completed"), activity])).values(),
  );
  const scheduledRows = activities.filter((activity) => {
    const day = activityDateKey(activity.activity_date);
    return activity.status === "agendada" && day >= weekStart && day <= weekEnd;
  });
  const scheduled = Array.from(
    new Map(scheduledRows.map((activity) => [dedupeKey(activity, "scheduled"), activity])).values(),
  );
  return { realized, completed, scheduled };
}

export function buildWeeklyActivityGoalSnapshot(params: {
  repId: string;
  repName: string;
  goal: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  todayKey: string;
  activities?: ActivityGoalSourceRow[];
}): WeeklyActivityGoalSnapshot {
  const activities = params.activities ?? [];
  const status = activityGoalStatus(params.todayKey, params.effectiveFrom, params.effectiveTo);
  const weekStart = selectedWeek(params.todayKey, params.effectiveFrom, params.effectiveTo);
  const weekEnd = dateOffset(weekStart, 6);
  const current = rowsForWeek(activities, weekStart, weekEnd);
  const breakdownMap = new Map<string, number>();
  for (const activity of current.completed) {
    const type = normalizedType(activity.activity_type);
    breakdownMap.set(type, (breakdownMap.get(type) ?? 0) + 1);
  }
  const breakdown = Array.from(breakdownMap, ([type, count]) => ({
    type,
    label: TYPE_LABELS[type] ?? TYPE_LABELS.otro,
    count,
  })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  const completed = current.completed.length;
  const history: ActivityGoalHistory[] = [];
  for (let index = 3; index >= 0; index -= 1) {
    const start = dateOffset(weekStart, index * -7);
    if (start < params.effectiveFrom || start > weekStart) continue;
    const end = dateOffset(start, 6);
    const total = rowsForWeek(activities, start, end).completed.length;
    history.push({ weekStart: start, weekEnd: end, completed: total, reached: total >= params.goal });
  }

  return {
    repId: params.repId,
    repName: params.repName,
    goal: params.goal,
    effectiveFrom: params.effectiveFrom,
    effectiveTo: params.effectiveTo,
    status,
    weekStart,
    weekEnd,
    completed,
    scheduled: current.scheduled.length,
    unqualified: current.realized.length - current.realized.filter(isQualifiedActivity).length,
    distinctAccounts: new Set(current.completed.map((activity) => activity.account_id)).size,
    remaining: Math.max(0, params.goal - completed),
    progress: params.goal ? (completed / params.goal) * 100 : 0,
    breakdown,
    history,
  };
}
