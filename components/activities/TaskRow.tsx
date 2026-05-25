"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { cn, formatDate } from "@/lib/utils";

export function TaskRow({
  id,
  accountId,
  accountName,
  activityType,
  nextStep,
  nextStepDate,
  done,
  overdue = false,
}: {
  id: string;
  accountId: string;
  accountName: string | null;
  activityType: string | null;
  nextStep: string;
  nextStepDate: string | null;
  done: boolean;
  overdue?: boolean;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [isDone, setIsDone] = useState(done);
  const [pending, startTransition] = useTransition();

  const toggle = () => {
    const next = !isDone;
    setIsDone(next);
    startTransition(async () => {
      const { error } = await supabase
        .from("activities")
        .update({ next_step_done: next })
        .eq("id", id);
      if (error) {
        setIsDone(!next);
        toast.error("No pudimos actualizar", { description: error.message });
        return;
      }
      toast.success(next ? "Tarea completada" : "Tarea reabierta");
      router.refresh();
    });
  };

  return (
    <div className="flex items-start gap-3 rounded-lg border bg-card p-3">
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        aria-pressed={isDone}
        aria-label={isDone ? "Marcar como pendiente" : "Marcar como hecha"}
        className={cn(
          "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors",
          isDone
            ? "border-emerald-600 bg-emerald-600 text-white"
            : "border-input hover:border-brand-carmesi",
        )}
      >
        {pending ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : isDone ? (
          <Check className="h-3.5 w-3.5" />
        ) : null}
      </button>

      <div className="min-w-0 flex-1">
        <div
          className={cn(
            "text-sm font-medium",
            isDone && "text-muted-foreground line-through",
          )}
        >
          {nextStep}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
          <Link
            href={`/cuentas/${accountId}`}
            className="hover:text-brand-carmesi hover:underline"
          >
            {accountName ?? "—"}
          </Link>
          {activityType && <span>· {activityType}</span>}
          {nextStepDate && (
            <span className={cn(!isDone && overdue && "font-medium text-red-600")}>
              · {formatDate(nextStepDate)}
              {!isDone && overdue ? " · vencida" : ""}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
