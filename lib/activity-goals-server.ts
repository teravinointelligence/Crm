import "server-only";
import { createClient } from "@/lib/supabase/server";
import { dateKeyTz } from "@/lib/utils";
import {
  buildWeeklyActivityGoalSnapshot,
  type ActivityGoalSourceRow,
  type WeeklyActivityGoalSnapshot,
} from "@/lib/activity-goals";

type DbClient = ReturnType<typeof createClient>;

type RepRef = { id: string; full_name: string };

type GoalRow = {
  sales_rep_id: string;
  weekly_goal: number;
  effective_from: string;
  effective_to: string | null;
};

function dayAfter(dateKey: string): string {
  const date = new Date(`${dateKey}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

export async function loadWeeklyActivityGoals(
  reps: RepRef[],
  now = new Date(),
  db: DbClient = createClient(),
): Promise<{ snapshots: WeeklyActivityGoalSnapshot[]; warning: string | null }> {
  if (!reps.length) return { snapshots: [], warning: null };
  const repNames = new Map(reps.map((rep) => [rep.id, rep.full_name]));
  const { data: goalData, error: goalError } = await db
    .from("seller_weekly_activity_goals")
    .select("sales_rep_id, weekly_goal, effective_from, effective_to")
    .in("sales_rep_id", reps.map((rep) => rep.id));
  const goals = (goalData ?? []) as GoalRow[];
  if (goalError || !goals.length) {
    return {
      snapshots: [],
      warning: goalError?.message ?? "Todavía no hay metas semanales configuradas.",
    };
  }

  const rangeStart = goals.map((goal) => goal.effective_from).sort()[0];
  const rangeEnd = goals
    .map((goal) => goal.effective_to ?? dayAfter(dateKeyTz(now)))
    .sort()
    .at(-1)!;
  const fromIso = `${rangeStart}T00:00:00-07:00`;
  const toIso = `${dayAfter(rangeEnd)}T00:00:00-07:00`;
  const ids = goals.map((goal) => goal.sales_rep_id);

  const [completedRes, scheduledRes] = await Promise.all([
    db
      .from("activities")
      .select(
        "id, sales_rep_id, account_id, activity_type, activity_date, completed_at, status, outcome, next_step",
      )
      .in("sales_rep_id", ids)
      .eq("status", "realizada")
      .gte("completed_at", fromIso)
      .lt("completed_at", toIso)
      .limit(20000),
    db
      .from("activities")
      .select(
        "id, sales_rep_id, account_id, activity_type, activity_date, completed_at, status, outcome, next_step",
      )
      .in("sales_rep_id", ids)
      .eq("status", "agendada")
      .gte("activity_date", fromIso)
      .lt("activity_date", toIso)
      .limit(20000),
  ]);
  const activities = [
    ...((completedRes.data ?? []) as ActivityGoalSourceRow[]),
    ...((scheduledRes.data ?? []) as ActivityGoalSourceRow[]),
  ];
  const todayKey = dateKeyTz(now);
  const snapshots = goals
    .map((goal) =>
      buildWeeklyActivityGoalSnapshot({
        repId: goal.sales_rep_id,
        repName: repNames.get(goal.sales_rep_id) ?? "Vendedor",
        goal: goal.weekly_goal,
        effectiveFrom: goal.effective_from,
        effectiveTo: goal.effective_to,
        todayKey,
        activities: activities.filter((activity) => activity.sales_rep_id === goal.sales_rep_id),
      }),
    )
    .sort((a, b) => a.repName.localeCompare(b.repName));

  return {
    snapshots,
    warning: completedRes.error?.message ?? scheduledRes.error?.message ?? null,
  };
}
