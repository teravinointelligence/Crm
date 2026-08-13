"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlarmClock,
  Banknote,
  Check,
  ClipboardList,
  Loader2,
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
import type { RepTaskOutcome, RepTaskSource } from "@/types/database";

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
  const [gone, setGone] = useState(false);
  const [doneOpen, setDoneOpen] = useState(false);
  const [snoozeOpen, setSnoozeOpen] = useState(false);
  const [outcome, setOutcome] = useState<RepTaskOutcome | null>(null);
  const [note, setNote] = useState("");

  const atraso = overdueDays(task.due_date, today);
  const Icon = SOURCE_ICON[task.source];

  const swipe = useSwipeAction({
    enabled: !pending && !gone,
    onSwipeRight: () => setDoneOpen(true),
    onSwipeLeft: () => setSnoozeOpen(true),
  });

  const complete = () => {
    if (!outcome) return;
    setDoneOpen(false);
    swipe.flingOut("right");
    setGone(true);
    startTransition(async () => {
      const { error } = await supabase
        .from("rep_tasks")
        .update({
          status: "hecha",
          outcome,
          result_note: note.trim() || null,
          completed_at: new Date().toISOString(),
        })
        .eq("id", task.id);
      if (error) {
        setGone(false);
        swipe.reset();
        toast.error("No pudimos cerrar la tarea", { description: error.message });
        return;
      }
      toast.success("Tarea cerrada", { description: OUTCOME_LABEL[outcome] });
      router.refresh();
    });
  };

  const snooze = (days: number, label: string) => {
    setSnoozeOpen(false);
    swipe.flingOut("left");
    setGone(true);
    startTransition(async () => {
      const { error } = await supabase
        .from("rep_tasks")
        .update({ due_date: addDays(today, days) })
        .eq("id", task.id);
      if (error) {
        setGone(false);
        swipe.reset();
        toast.error("No pudimos posponer", { description: error.message });
        return;
      }
      toast.success(`Pospuesta para ${label.toLowerCase()}`);
      router.refresh();
    });
  };

  const discard = () => {
    setSnoozeOpen(false);
    swipe.flingOut("left");
    setGone(true);
    startTransition(async () => {
      const { error } = await supabase
        .from("rep_tasks")
        .update({
          status: "descartada",
          result_note: "Descartada por el vendedor",
          completed_at: new Date().toISOString(),
        })
        .eq("id", task.id);
      if (error) {
        setGone(false);
        swipe.reset();
        toast.error("No pudimos descartar", { description: error.message });
        return;
      }
      toast.success("Tarea descartada");
      router.refresh();
    });
  };

  return (
    <div
      className={cn(
        // Se desvanece a la vez que sale volando; el router.refresh() la quita.
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
          "relative rounded-lg border bg-card p-3",
          atraso > 0 && "border-l-4 border-l-red-500",
        )}
      >
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Icon className="h-4 w-4 text-muted-foreground" />
            )}
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium">{task.title}</span>
              <Badge variant={SOURCE_VARIANT[task.source]} className="text-[11px]">
                {SOURCE_LABEL[task.source]}
              </Badge>
              {atraso > 0 && (
                <Badge variant="danger" className="text-[11px]">
                  {atraso === 1 ? "1 día de atraso" : `${atraso} días de atraso`}
                </Badge>
              )}
            </div>

            {task.detail && (
              <p className="mt-0.5 text-xs text-muted-foreground">{task.detail}</p>
            )}

            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
              {task.account_id && (
                <Link
                  href={`/cuentas/${task.account_id}`}
                  className="hover:text-brand-carmesi hover:underline"
                >
                  {task.account_name ?? "Ver cuenta"}
                </Link>
              )}
              <span>· {formatDate(task.due_date)}</span>
              {task.account_id && (
                <Link
                  href={`/actividades/nueva?estado=agendada&account=${task.account_id}`}
                  className="hover:text-brand-carmesi hover:underline"
                >
                  · Agendar visita
                </Link>
              )}
            </div>

            {/* Botones para escritorio; en celular manda el gesto. */}
            <div className="mt-2 flex items-center gap-2">
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
            </div>

            <p className="mt-1 text-[11px] text-muted-foreground/70 sm:hidden">
              Desliza → hecho · ← posponer
            </p>
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
                onClick={() => setOutcome(o)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-sm transition-colors",
                  outcome === o
                    ? "border-brand-carmesi bg-brand-carmesi text-white"
                    : "border-border hover:bg-muted",
                )}
              >
                {OUTCOME_LABEL[o]}
              </button>
            ))}
          </div>

          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Nota (opcional): qué acordaron, cuándo le hablas otra vez…"
            rows={3}
          />

          <DialogFooter>
            <Button variant="outline" onClick={() => setDoneOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={complete} disabled={!outcome}>
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
