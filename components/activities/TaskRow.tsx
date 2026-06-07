"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Loader2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { cn, formatDate } from "@/lib/utils";

// Umbral de deslizamiento (px) para que cuente como "completar".
const SWIPE_THRESHOLD = 96;

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

  // Gesto de deslizar (solo para tareas pendientes → completar).
  const cardRef = useRef<HTMLDivElement>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const locked = useRef<"h" | "v" | null>(null);
  const widthRef = useRef(0);
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);

  const setNextDone = (next: boolean, exitToRight = false) => {
    setIsDone(next);
    if (exitToRight && cardRef.current) setDragX(cardRef.current.offsetWidth + 24);
    startTransition(async () => {
      const { error } = await supabase
        .from("activities")
        .update({ next_step_done: next })
        .eq("id", id);
      if (error) {
        setIsDone(!next);
        setDragX(0);
        toast.error("No pudimos actualizar", { description: error.message });
        return;
      }
      toast.success(next ? "Tarea completada" : "Tarea reabierta");
      router.refresh();
    });
  };

  const toggle = () => setNextDone(!isDone);

  const swipeEnabled = !isDone && !pending;

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!swipeEnabled) return;
    start.current = { x: e.clientX, y: e.clientY };
    locked.current = null;
    widthRef.current = cardRef.current?.offsetWidth ?? 0;
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!swipeEnabled || !start.current) return;
    const dx = e.clientX - start.current.x;
    const dy = e.clientY - start.current.y;
    if (locked.current === null) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      // Bloqueamos el eje dominante: horizontal → deslizar; vertical → dejar scroll.
      locked.current = Math.abs(dx) > Math.abs(dy) ? "h" : "v";
      if (locked.current === "h") {
        try {
          cardRef.current?.setPointerCapture(e.pointerId);
        } catch {
          /* algunos navegadores/eventos no permiten capturar; el gesto igual funciona */
        }
        setDragging(true);
      }
    }
    if (locked.current === "h") {
      e.preventDefault();
      // Solo hacia la derecha; con un poco de resistencia pasado el umbral.
      const clamped = Math.max(0, dx);
      setDragX(clamped > SWIPE_THRESHOLD * 1.6 ? SWIPE_THRESHOLD * 1.6 + (clamped - SWIPE_THRESHOLD * 1.6) * 0.3 : clamped);
    }
  };

  const onPointerUp = () => {
    const wasHorizontal = locked.current === "h";
    start.current = null;
    locked.current = null;
    if (!wasHorizontal) return;
    setDragging(false);
    if (dragX >= SWIPE_THRESHOLD) {
      setNextDone(true, true); // completar con salida hacia la derecha
    } else {
      setDragX(0); // regresa a su lugar
    }
  };

  const reveal = Math.min(dragX / SWIPE_THRESHOLD, 1);

  return (
    <div className="relative overflow-hidden rounded-lg">
      {/* Fondo de acción que se revela al deslizar */}
      <div
        className="absolute inset-0 flex items-center gap-2 bg-emerald-600 px-4 text-sm font-medium text-white"
        style={{ opacity: reveal }}
        aria-hidden
      >
        <Check className="h-5 w-5" />
        Completar
      </div>

      <div
        ref={cardRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{
          transform: `translateX(${dragX}px)`,
          transition: dragging ? "none" : "transform 0.2s ease",
          touchAction: swipeEnabled ? "pan-y" : undefined,
        }}
        className="relative flex items-start gap-3 rounded-lg border bg-card p-3"
      >
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
            <Link
              href={`/actividades/${id}/editar`}
              className="inline-flex items-center gap-1 hover:text-brand-carmesi hover:underline"
            >
              · <Pencil className="h-3 w-3" /> Editar
            </Link>
          </div>
          {swipeEnabled && (
            <div className="mt-1 text-[11px] text-muted-foreground/70 sm:hidden">
              Desliza → para completar
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
