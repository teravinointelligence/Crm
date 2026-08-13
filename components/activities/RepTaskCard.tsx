"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlarmClock,
  Banknote,
  Check,
  CheckCircle2,
  ClipboardList,
  Loader2,
  RotateCcw,
  Sparkles,
  UserPlus,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useSwipeAction } from "@/components/ui/use-swipe-action";
import { cn, formatDate } from "@/lib/utils";
import {
  OUTCOME_LABEL,
  SNOOZE_OPTIONS,
  SOURCE_LABEL,
  addDays,
  outcomesForSource,
  overdueDays,
} from "@/lib/rep-tasks";
import type { RepTaskOutcome, RepTaskSource, RepTaskStatus } from "@/types/database";

const SOURCE_ICON: Record<RepTaskSource, typeof Check> = {
  prospecto: UserPlus,
  cobranza: Banknote,
  inactivo: Sparkles,
  manual: ClipboardList,
};

const SOURCE_VARIANT: Record<RepTaskSource, "accent" | "warning" | "danger" | "muted"> = {
  prospecto: "accent",
  cobranza: "danger",
  inactivo: "warning",
  manual: "muted",
};

export type RepTaskCardData = {
  id: string;
  source: RepTaskSource;
  title: string;
  detail: string | null;
  due_date: string;
  account_id: string | null;
  account_name: string | null;
  status: RepTaskStatus;
  outcome: RepTaskOutcome | null;
  result_note: string | null;
};

export function RepTaskCard({
  task,
  today,
}: {
  task: RepTaskCardData;
  today: string;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [pending, startTransition] = useTransition();

  // Estado local para que la tarjeta cambie de color en el momento, sin
  // esperar al refresh del servidor.
  const [status, setStatus] = useState<RepTaskStatus>(task.status);
  const [outcome, setOutcome] = useState<RepTaskOutcome | null>(task.outcome);
  const [resultNote, setResultNote] = useState<string | null>(task.result_note);
  const [gone, setGone] = useState(false);

  const [doneOpen, setDoneOpen] = useState(false);
  const [snoozeOpen, setSnoozeOpen] = useState(false);
  const [draftOutcome, setDraftOutcome] = useState<RepTaskOutcome | null>(null);
  const [draftNote, setDraftNote] = useState("");

  const cerrada = status !== "pendiente";
  const atraso = cerrada ? 0 : overdueDays(task.due_date, today);
  const Icon = SOURCE_ICON[task.source];

  const swipe = useSwipeAction({
    enabled: !pending && !cerrada && !gone,
    onSwipeRight: () => setDoneOpen(true),
    onSwipeLeft: () => setSnoozeOpen(true),
  });

  /** Cerrar la tarea: la tarjeta se queda en su lugar y se pone verde. */
  const complete = () => {
    if (!draftOutcome) return;
    const nota = draftNote.trim() || null;
    setDoneOpen(false);
    setStatus("hecha");
    setOutcome(draftOutcome);
    setResultNote(nota);
    startTransition(async () => {
      const { error } = await supabase
        .from("rep_tasks")
        .update({
          status: "hecha",
          outcome: draftOutcome,
          result_note: nota,
          completed_at: new Date().toISOString(),
        })
        .eq("id", task.id);
      if (error) {
        setStatus("pendiente");
        setOutcome(null);
        setResultNote(null);
        toast.error("No pudimos cerrar la tarea", { description: error.message });
        return;
      }
      toast.success("Tarea cerrada", { description: OUTCOME_LABEL[draftOutcome] });
      router.refresh();
    });
  };

  const reopen = () => {
    const prev = { status, outcome, resultNote };
    setStatus("pendiente");
    setOutcome(null);
    setResultNote(null);
    startTransition(async () => {
      const { error } = await supabase
        .from("rep_tasks")
        .update({ status: "pendiente", outcome: null, result_note: null, completed_at: null })
        .eq("id", task.id);
      if (error) {
        setStatus(prev.status);
        setOutcome(prev.outcome);
        setResultNote(prev.resultNote);
        toast.error("No pudimos reabrir la tarea", { description: error.message });
        return;
      }
      toast.success("Tarea reabierta");
      router.refresh();
    });
  };

  // Posponer y descartar sí sacan la tarjeta: dejan de ser de hoy.
  const leave = (patch: Record<string, unknown>, ok: string) => {
    setSnoozeOpen(false);
    swipe.flingOut("left");
    setGone(true);
    startTransition(async () => {
      const { error } = await supabase.from("rep_tasks").update(patch).eq("id", task.id);
      if (error) {
        setGone(false);
        swipe.reset();
        toast.error("No pudimos actualizar la tarea", { description: error.message });
        return;
      }
      toast.success(ok);
      router.refresh();
    });
  };

  const snooze = (days: number, label: string) =>
    leave({ due_date: addDays(today, days) }, `Pospuesta para ${label.toLowerCase()}`);

  const discard = () =>
    leave(
      {
        status: "descartada",
        result_note: "Descartada por el vendedor",
        completed_at: new Date().toISOString(),
      },
      "Tarea descartada",
    );

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-lg transition-opacity duration-200",
        gone && "pointer-events-none opacity-0",
      )}
    >
      {/* Fondos de acción que se revelan al deslizar */}
      <div
        className="absolute inset-0 flex items-center gap-2 bg-emerald-600 px-4 text-sm font-medium text-white"
        style={{ opacity: swipe.revealRight }}
        aria-hidden
      >
        <Check className="h-5 w-5" /> Hecho
      </div>
      <div
        className="absolute inset-0 flex items-center justify-end gap-2 bg-amber-500 px-4 text-sm font-medium text-white"
        style={{ opacity: swipe.revealLeft }}
        aria-hidden
      >
        Posponer <AlarmClock className="h-5 w-5" />
      </div>

      <div
        ref={swipe.ref}
        {...swipe.handlers}
        style={swipe.style}
        className={cn(
          "relative rounded-lg border p-3 transition-colors duration-300",
          cerrada
            ? "border-emerald-300 bg-emerald-50"
            : "bg-card",
          !cerrada && atraso > 0 && "border-l-4 border-l-red-500",
        )}
      >
        <div className="flex items-start gap-3">
          <span
            className={cn(
              "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors",
              cerrada ? "bg-emerald-600 text-white" : "bg-muted",
            )}
          >
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : cerrada ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              <Icon className="h-4 w-4 text-muted-foreground" />
            )}
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  "text-sm font-medium",
                  cerrada && "text-emerald-900/70 line-through",
                )}
              >
                {task.title}
              </span>
              {cerrada && outcome ? (
                <Badge variant="success" className="text-[11px]">
                  {OUTCOME_LABEL[outcome]}
                </Badge>
              ) : (
                <Badge variant={SOURCE_VARIANT[task.source]} className="text-[11px]">
                  {SOURCE_LABEL[task.source]}
                </Badge>
              )}
              {atraso > 0 && (
                <Badge variant="danger" className="text-[11px]">
                  {atraso === 1 ? "1 día de atraso" : `${atraso} días de atraso`}
                </Badge>
              )}
            </div>

            {cerrada ? (
              resultNote && (
                <p className="mt-0.5 text-xs text-emerald-900/70">“{resultNote}”</p>
              )
            ) : (
              task.detail && (
                <p className="mt-0.5 text-xs text-muted-foreground">{task.detail}</p>
              )
            )}

            <div
              className={cn(
                "mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs",
                cerrada ? "text-emerald-900/60" : "text-muted-foreground",
              )}
            >
              {task.account_id && (
                <Link
                  href={`/cuentas/${task.account_id}`}
                  className="hover:text-brand-carmesi hover:underline"
                >
                  {task.account_name ?? "Ver cuenta"}
                </Link>
              )}
              <span>· {formatDate(task.due_date)}</span>
              {!cerrada && task.account_id && (
                <Link
                  href={`/actividades/nueva?estado=agendada&account=${task.account_id}`}
                  className="hover:text-brand-carmesi hover:underline"
                >
                  · Agendar visita
                </Link>
              )}
            </div>

            <div className="mt-2 flex items-center gap-2">
              {cerrada ? (
                <Button size="sm" variant="ghost" onClick={reopen} disabled={pending}>
                  <RotateCcw className="mr-1 h-3.5 w-3.5" /> Reabrir
                </Button>
              ) : (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setDoneOpen(true)}
                    disabled={pending}
                  >
                    <Check className="mr-1 h-3.5 w-3.5" /> Hecho
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setSnoozeOpen(true)}
                    disabled={pending}
                  >
                    <AlarmClock className="mr-1 h-3.5 w-3.5" /> Posponer
                  </Button>
                </>
              )}
            </div>

            {!cerrada && (
              <p className="mt-1 text-[11px] text-muted-foreground/70 sm:hidden">
                Desliza → hecho · ← posponer
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Cerrar: pide resultado (obligatorio) y nota (opcional) */}
      <Dialog open={doneOpen} onOpenChange={setDoneOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Cómo te fue?</DialogTitle>
            <DialogDescription>{task.title}</DialogDescription>
          </DialogHeader>

          <div className="flex flex-wrap gap-2">
            {outcomesForSource(task.source).map((o) => (
              <button
                key={o}
                type="button"
                onClick={() => setDraftOutcome(o)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-sm transition-colors",
                  draftOutcome === o
                    ? "border-brand-carmesi bg-brand-carmesi text-white"
                    : "border-border hover:bg-muted",
                )}
              >
                {OUTCOME_LABEL[o]}
              </button>
            ))}
          </div>

          <Textarea
            value={draftNote}
            onChange={(e) => setDraftNote(e.target.value)}
            placeholder="Nota (opcional): qué acordaron, cuándo le hablas otra vez…"
            rows={3}
          />

          <DialogFooter>
            <Button variant="outline" onClick={() => setDoneOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={complete} disabled={!draftOutcome}>
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Posponer / descartar */}
      <Dialog open={snoozeOpen} onOpenChange={setSnoozeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Posponer tarea</DialogTitle>
            <DialogDescription>{task.title}</DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-2">
            {SNOOZE_OPTIONS.map((o) => (
              <Button
                key={o.days}
                variant="outline"
                className="justify-start"
                onClick={() => snooze(o.days, o.label)}
              >
                <AlarmClock className="mr-2 h-4 w-4" /> {o.label}
              </Button>
            ))}
            <Button variant="ghost" className="justify-start text-red-600" onClick={discard}>
              <X className="mr-2 h-4 w-4" /> No aplica, descartar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
