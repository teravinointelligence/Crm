import Link from "next/link";
import { Plus, ListChecks } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ActivityViewTabs } from "@/components/activities/ActivityViewTabs";
import { TaskRow } from "@/components/activities/TaskRow";

export const metadata = { title: "Tareas — TERAVINO CRM" };

function pad(n: number) {
  return String(n).padStart(2, "0");
}

type Row = {
  id: string;
  activity_type: string | null;
  next_step: string | null;
  next_step_date: string | null;
  next_step_done: boolean;
  account_id: string;
  accounts: { business_name: string | null } | null;
};

export default async function TareasPage({
  searchParams,
}: {
  searchParams: { ver?: string };
}) {
  const supabase = createClient();
  const showDone = searchParams.ver === "hechas";

  const now = new Date();
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const weekEndDate = new Date(now);
  weekEndDate.setDate(weekEndDate.getDate() + 7);
  const weekEnd = `${weekEndDate.getFullYear()}-${pad(weekEndDate.getMonth() + 1)}-${pad(weekEndDate.getDate())}`;

  const query = supabase
    .from("activities")
    .select(
      "id, activity_type, next_step, next_step_date, next_step_done, account_id, accounts:account_id(business_name)",
    )
    .not("next_step", "is", null)
    .eq("next_step_done", showDone);

  const { data } = showDone
    ? await query.order("next_step_date", { ascending: false }).limit(100)
    : await query.order("next_step_date", { ascending: true, nullsFirst: false });

  const rows = (data ?? []) as unknown as Row[];

  const groups: { key: string; label: string; rows: Row[]; overdue?: boolean }[] =
    [
      { key: "vencidas", label: "Vencidas", rows: [], overdue: true },
      { key: "hoy", label: "Hoy", rows: [] },
      { key: "semana", label: "Esta semana", rows: [] },
      { key: "adelante", label: "Más adelante", rows: [] },
      { key: "sinfecha", label: "Sin fecha", rows: [] },
    ];
  const byKey = Object.fromEntries(groups.map((g) => [g.key, g]));

  for (const r of rows) {
    const d = r.next_step_date?.slice(0, 10) ?? null;
    if (!d) byKey.sinfecha.rows.push(r);
    else if (d < today) byKey.vencidas.rows.push(r);
    else if (d === today) byKey.hoy.rows.push(r);
    else if (d <= weekEnd) byKey.semana.rows.push(r);
    else byKey.adelante.rows.push(r);
  }

  const pendingCount = rows.length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl">Actividades</h1>
          <p className="text-sm text-muted-foreground">
            Siguientes pasos por cuenta, ordenados por vencimiento.
          </p>
        </div>
        <Button asChild>
          <Link href="/actividades/nueva">
            <Plus className="mr-1 h-4 w-4" /> Nueva actividad
          </Link>
        </Button>
      </div>

      <ActivityViewTabs />

      <div className="flex items-center gap-2">
        <Button asChild variant={showDone ? "outline" : "default"} size="sm">
          <Link href="/actividades/tareas">Pendientes</Link>
        </Button>
        <Button asChild variant={showDone ? "default" : "outline"} size="sm">
          <Link href="/actividades/tareas?ver=hechas">Completadas</Link>
        </Button>
      </div>

      {showDone ? (
        rows.length ? (
          <div className="space-y-2">
            {rows.map((r) => (
              <TaskRow
                key={r.id}
                id={r.id}
                accountId={r.account_id}
                accountName={r.accounts?.business_name ?? null}
                activityType={r.activity_type}
                nextStep={r.next_step ?? "siguiente paso"}
                nextStepDate={r.next_step_date}
                done
              />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={ListChecks}
            title="Sin tareas completadas"
            description="Cuando marques siguientes pasos como hechos aparecerán aquí."
          />
        )
      ) : pendingCount ? (
        <div className="space-y-6">
          {groups
            .filter((g) => g.rows.length > 0)
            .map((g) => (
              <section key={g.key} className="space-y-2">
                <h2 className="flex items-center gap-2 font-display text-lg">
                  {g.label}
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-normal text-muted-foreground">
                    {g.rows.length}
                  </span>
                </h2>
                <div className="space-y-2">
                  {g.rows.map((r) => (
                    <TaskRow
                      key={r.id}
                      id={r.id}
                      accountId={r.account_id}
                      accountName={r.accounts?.business_name ?? null}
                      activityType={r.activity_type}
                      nextStep={r.next_step ?? "siguiente paso"}
                      nextStepDate={r.next_step_date}
                      done={false}
                      overdue={g.overdue}
                    />
                  ))}
                </div>
              </section>
            ))}
        </div>
      ) : (
        <EmptyState
          icon={ListChecks}
          title="Sin pendientes"
          description="Registra una actividad con un siguiente paso y aparecerá aquí como tarea."
        />
      )}
    </div>
  );
}
