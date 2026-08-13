import { redirect } from "next/navigation";
import Link from "next/link";
import { CalendarCheck2, Plus, Sun } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRep } from "@/lib/auth";
import { SELLER_ROLES } from "@/lib/modules";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ActivityViewTabs } from "@/components/activities/ActivityViewTabs";
import { AgendaCitaCard, type AgendaCitaData } from "@/components/activities/AgendaCitaCard";
import { RepTaskCard, type RepTaskCardData } from "@/components/activities/RepTaskCard";
import { TaskRow } from "@/components/activities/TaskRow";
import { GenerarTareasButton } from "@/components/activities/GenerarTareasButton";
import { dateKeyTz } from "@/lib/utils";
import { compareTasks } from "@/lib/rep-tasks";
import type { RepTask } from "@/types/database";

export const metadata = { title: "Mi día — TERAVINO CRM" };

type ActivityRow = {
  id: string;
  activity_type: string | null;
  activity_date: string;
  status: string;
  notes: string | null;
  account_id: string;
  accounts: { business_name: string | null } | null;
};

type NextStepRow = {
  id: string;
  activity_type: string | null;
  next_step: string | null;
  next_step_date: string | null;
  account_id: string;
  accounts: { business_name: string | null } | null;
};

export default async function MiDiaPage({
  searchParams,
}: {
  searchParams: { rep?: string };
}) {
  const me = await getCurrentRep();
  if (!me) redirect("/login");

  const supabase = createClient();
  const isAdmin = me.role === "admin";
  // El admin puede espiar el día de cualquier vendedor; por default ve el suyo.
  const repId = isAdmin && searchParams.rep ? searchParams.rep : me.id;

  const now = new Date();
  const today = dateKeyTz(now);

  // Citas: ventana ±1 día en UTC porque activity_date es timestamptz y el
  // bucketing por día va en hora de Mazatlán (mismo truco que el calendario).
  const from = new Date(`${today}T00:00:00Z`);
  from.setUTCDate(from.getUTCDate() - 8); // 8 días atrás para las que se pasaron
  const to = new Date(`${today}T00:00:00Z`);
  to.setUTCDate(to.getUTCDate() + 2);

  const { data: repsData } = isAdmin
    ? await supabase
        .from("sales_reps")
        .select("id, full_name")
        .eq("active", true)
        .in("role", SELLER_ROLES)
        .order("full_name")
    : { data: null };
  const reps = (repsData ?? []) as { id: string; full_name: string }[];

  const [citasRes, tareasRes, pasosRes] = await Promise.all([
    supabase
      .from("activities")
      .select(
        "id, activity_type, activity_date, status, notes, account_id, accounts:account_id(business_name)",
      )
      .eq("status", "agendada")
      .eq("sales_rep_id", repId)
      .gte("activity_date", from.toISOString())
      .lt("activity_date", to.toISOString())
      .order("activity_date", { ascending: true }),
    supabase
      .from("rep_tasks")
      .select("*")
      .eq("sales_rep_id", repId)
      .eq("status", "pendiente")
      .lte("due_date", today),
    supabase
      .from("activities")
      .select(
        "id, activity_type, next_step, next_step_date, account_id, accounts:account_id(business_name)",
      )
      .eq("sales_rep_id", repId)
      .not("next_step", "is", null)
      .eq("next_step_done", false)
      .lte("next_step_date", today)
      .order("next_step_date", { ascending: true }),
  ]);

  const citasAll = (citasRes.data ?? []) as unknown as ActivityRow[];
  const citasHoy: AgendaCitaData[] = [];
  const citasAtrasadas: AgendaCitaData[] = [];
  for (const a of citasAll) {
    const day = dateKeyTz(a.activity_date);
    if (day > today) continue; // las de mañana en adelante no son "mi día"
    const item: AgendaCitaData = {
      id: a.id,
      activity_type: a.activity_type,
      activity_date: a.activity_date,
      account_id: a.account_id,
      account_name: a.accounts?.business_name ?? null,
      notes: a.notes,
    };
    if (day === today) citasHoy.push(item);
    else citasAtrasadas.push(item);
  }

  const tareas = ((tareasRes.data ?? []) as RepTask[])
    .slice()
    .sort(compareTasks)
    .map<RepTaskCardData>((t) => ({
      id: t.id,
      source: t.source,
      title: t.title,
      detail: t.detail,
      due_date: t.due_date,
      account_id: t.account_id,
      account_name: null,
    }));

  // Nombre de la cuenta para las tareas (la tabla no lo guarda duplicado).
  const accountIds = [...new Set(tareas.map((t) => t.account_id).filter(Boolean))] as string[];
  if (accountIds.length) {
    const { data: accts } = await supabase
      .from("accounts")
      .select("id, business_name")
      .in("id", accountIds);
    const names = new Map(
      ((accts ?? []) as { id: string; business_name: string | null }[]).map((a) => [
        a.id,
        a.business_name,
      ]),
    );
    for (const t of tareas) {
      if (t.account_id) t.account_name = names.get(t.account_id) ?? null;
    }
  }

  const pasos = (pasosRes.data ?? []) as unknown as NextStepRow[];

  const total = citasHoy.length + citasAtrasadas.length + tareas.length + pasos.length;
  const fechaLarga = new Intl.DateTimeFormat("es-MX", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(now);

  const repName = reps.find((r) => r.id === repId)?.full_name;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl">Mi día</h1>
          <p className="text-sm capitalize text-muted-foreground">
            {fechaLarga}
            {isAdmin && repName && repId !== me.id ? ` · ${repName}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && <GenerarTareasButton />}
          <Button asChild>
            <Link href="/actividades/nueva?estado=agendada">
              <Plus className="mr-1 h-4 w-4" /> Agendar
            </Link>
          </Button>
        </div>
      </div>

      <ActivityViewTabs />

      {/* El admin puede revisar el día de cada vendedor */}
      {isAdmin && reps.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {reps.map((r) => (
            <Link
              key={r.id}
              href={`/actividades/hoy${r.id === me.id ? "" : `?rep=${r.id}`}`}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                repId === r.id
                  ? "border-brand-carmesi bg-brand-carmesi text-white"
                  : "border-border text-muted-foreground hover:bg-muted"
              }`}
            >
              {r.full_name.split(" ")[0]}
            </Link>
          ))}
        </div>
      )}

      {total === 0 ? (
        <EmptyState
          icon={Sun}
          title="Nada pendiente hoy"
          description="No tienes citas, tareas ni siguientes pasos para hoy. Aprovecha para agendar visitas de la semana."
        />
      ) : (
        <div className="space-y-8">
          {citasAtrasadas.length > 0 && (
            <Section title="Se te pasaron" count={citasAtrasadas.length} tone="danger">
              {citasAtrasadas.map((c) => (
                <AgendaCitaCard key={c.id} cita={c} atrasada />
              ))}
            </Section>
          )}

          {citasHoy.length > 0 && (
            <Section title="Citas de hoy" count={citasHoy.length}>
              {citasHoy.map((c) => (
                <AgendaCitaCard key={c.id} cita={c} />
              ))}
            </Section>
          )}

          {tareas.length > 0 && (
            <Section title="Tu seguimiento" count={tareas.length}>
              {tareas.map((t) => (
                <RepTaskCard key={t.id} task={t} today={today} />
              ))}
            </Section>
          )}

          {pasos.length > 0 && (
            <Section title="Siguientes pasos" count={pasos.length}>
              {pasos.map((p) => (
                <TaskRow
                  key={p.id}
                  id={p.id}
                  accountId={p.account_id}
                  accountName={p.accounts?.business_name ?? null}
                  activityType={p.activity_type}
                  nextStep={p.next_step ?? "siguiente paso"}
                  nextStepDate={p.next_step_date}
                  done={false}
                  overdue={!!p.next_step_date && p.next_step_date < today}
                />
              ))}
            </Section>
          )}
        </div>
      )}

      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <CalendarCheck2 className="h-3.5 w-3.5" />
        El seguimiento de prospectos, cobranza y clientes inactivos se arma solo cada
        mañana con los datos del CRM.
      </p>
    </div>
  );
}

function Section({
  title,
  count,
  tone,
  children,
}: {
  title: string;
  count: number;
  tone?: "danger";
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h2 className="flex items-center gap-2 font-display text-lg">
        {title}
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-normal ${
            tone === "danger"
              ? "bg-red-100 text-red-800"
              : "bg-muted text-muted-foreground"
          }`}
        >
          {count}
        </span>
      </h2>
      <div className="space-y-2">{children}</div>
    </section>
  );
}
