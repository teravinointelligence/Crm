"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlarmClock,
  Building2,
  CalendarClock,
  Check,
  CheckCircle2,
  Loader2,
  Pencil,
  RotateCcw,
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
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useSwipeAction } from "@/components/ui/use-swipe-action";
import { cn, formatDate, formatTime } from "@/lib/utils";
import { SNOOZE_OPTIONS } from "@/lib/rep-tasks";

export type AgendaCitaData = {
  id: string;
  activity_type: string | null;
  activity_date: string;
  account_id: string;
  account_name: string | null;
  notes: string | null;
};

/** Suma días a un timestamp ISO conservando la hora de la cita. */
function shiftIso(iso: string, days: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

export function AgendaCitaCard({
  cita,
  atrasada = false,
  done = false,
}: {
  cita: AgendaCitaData;
  atrasada?: boolean;
  /** La cita ya se marcó como realizada: se pinta en verde. */
  done?: boolean;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [pending, startTransition] = useTransition();
  const [gone, setGone] = useState(false);
  const [realizada, setRealizada] = useState(done);
  const [reagendarOpen, setReagendarOpen] = useState(false);

  const swipe = useSwipeAction({
    enabled: !pending && !realizada && !gone,
    onSwipeRight: () => marcarRealizada(),
    onSwipeLeft: () => setReagendarOpen(true),
  });

  /** Reagendar o cancelar sí sacan la tarjeta: dejan de ser de hoy. */
  function leave(patch: Record<string, unknown>, ok: string) {
    swipe.flingOut("left");
    setGone(true);
    startTransition(async () => {
      const { error } = await supabase.from("activities").update(patch).eq("id", cita.id);
      if (error) {
        setGone(false);
        swipe.reset();
        toast.error("No pudimos actualizar la cita", { description: error.message });
        return;
      }
      toast.success(ok);
      router.refresh();
    });
  }

  /** Marcarla realizada la deja en su lugar y la pinta de verde. */
  function marcarRealizada() {
    setRealizada(true);
    startTransition(async () => {
      const { error } = await supabase
        .from("activities")
        .update({ status: "realizada" })
        .eq("id", cita.id);
      if (error) {
        setRealizada(false);
        toast.error("No pudimos actualizar la cita", { description: error.message });
        return;
      }
      toast.success("Cita marcada como realizada");
      router.refresh();
    });
  }

  function reabrir() {
    setRealizada(false);
    startTransition(async () => {
      const { error } = await supabase
        .from("activities")
        .update({ status: "agendada" })
        .eq("id", cita.id);
      if (error) {
        setRealizada(true);
        toast.error("No pudimos reabrir la cita", { description: error.message });
        return;
      }
      toast.success("Cita reabierta");
      router.refresh();
    });
  }

  function reagendar(days: number, label: string) {
    setReagendarOpen(false);
    leave(
      { activity_date: shiftIso(cita.activity_date, days) },
      `Reagendada para ${label.toLowerCase()}`,
    );
  }

  function cancelar() {
    setReagendarOpen(false);
    leave({ status: "cancelada" }, "Cita cancelada");
  }

  return (
    <div
      className={cn(
        // Se desvanece a la vez que sale volando; el router.refresh() la quita.
        "relative overflow-hidden rounded-lg transition-opacity duration-200",
        gone && "pointer-events-none opacity-0",
      )}
    >
      <div
        className="absolute inset-0 flex items-center gap-2 bg-emerald-600 px-4 text-sm font-medium text-white"
        style={{ opacity: swipe.revealRight }}
        aria-hidden
      >
        <Check className="h-5 w-5" /> Realizada
      </div>
      <div
        className="absolute inset-0 flex items-center justify-end gap-2 bg-amber-500 px-4 text-sm font-medium text-white"
        style={{ opacity: swipe.revealLeft }}
        aria-hidden
      >
        Reagendar <AlarmClock className="h-5 w-5" />
      </div>

      <div
        ref={swipe.ref}
        {...swipe.handlers}
        style={swipe.style}
        className={cn(
          "relative rounded-lg border p-3 transition-colors duration-300",
          realizada ? "border-emerald-300 bg-emerald-50" : "bg-card",
          !realizada && atrasada && "border-l-4 border-l-red-500",
        )}
      >
        <div className="flex items-start gap-3">
          <span
            className={cn(
              "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors",
              realizada ? "bg-emerald-600 text-white" : "bg-muted",
            )}
          >
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : realizada ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              <CalendarClock className="h-4 w-4 text-muted-foreground" />
            )}
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              {/* El título ES el cliente: tocarlo debe llevar a su ficha. */}
              <Link
                href={`/cuentas/${cita.account_id}`}
                className={cn(
                  "text-sm font-medium underline-offset-2 hover:text-brand-carmesi hover:underline",
                  realizada && "text-emerald-900/70 line-through",
                )}
              >
                {cita.account_name ?? "Cita"}
              </Link>
              <Badge variant={realizada ? "success" : "accent"} className="text-[11px]">
                {realizada ? "Realizada" : (cita.activity_type ?? "cita")}
              </Badge>
              {!realizada && atrasada && (
                <Badge variant="danger" className="text-[11px]">
                  Se pasó · {formatDate(cita.activity_date)}
                </Badge>
              )}
            </div>

            <p
              className={cn(
                "mt-0.5 text-xs",
                realizada ? "text-emerald-900/60" : "text-muted-foreground",
              )}
            >
              {formatTime(cita.activity_date)}
              {cita.notes ? ` · ${cita.notes}` : ""}
            </p>

            {/* Accesos con área de toque de verdad, no enlaces de 11 px. */}
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <Link
                href={`/cuentas/${cita.account_id}`}
                className="inline-flex items-center gap-1 rounded-full border border-brand-carmesi/30 bg-brand-carmesi/10 px-2.5 py-1 text-xs font-medium text-brand-carmesi transition-colors hover:bg-brand-carmesi/20"
              >
                <Building2 className="h-3 w-3" />
                {cita.account_name ?? "Ver cliente"}
              </Link>
              <Link
                href={`/actividades/${cita.id}/editar`}
                className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted"
              >
                <Pencil className="h-3 w-3" /> Editar
              </Link>
            </div>

            <div className="mt-2 flex items-center gap-2">
              {realizada ? (
                <Button size="sm" variant="ghost" onClick={reabrir} disabled={pending}>
                  <RotateCcw className="mr-1 h-3.5 w-3.5" /> Reabrir
                </Button>
              ) : (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={marcarRealizada}
                    disabled={pending}
                  >
                    <Check className="mr-1 h-3.5 w-3.5" /> Realizada
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setReagendarOpen(true)}
                    disabled={pending}
                  >
                    <AlarmClock className="mr-1 h-3.5 w-3.5" /> Reagendar
                  </Button>
                </>
              )}
            </div>

            {!realizada && (
              <p className="mt-1 text-[11px] text-muted-foreground/70 sm:hidden">
                Desliza → realizada · ← reagendar
              </p>
            )}
          </div>
        </div>
      </div>

      <Dialog open={reagendarOpen} onOpenChange={setReagendarOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reagendar cita</DialogTitle>
            <DialogDescription>
              {cita.account_name ?? "Cita"} · {formatDate(cita.activity_date)}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-2">
            {SNOOZE_OPTIONS.map((o) => (
              <Button
                key={o.days}
                variant="outline"
                className="justify-start"
                onClick={() => reagendar(o.days, o.label)}
              >
                <AlarmClock className="mr-2 h-4 w-4" /> {o.label}
              </Button>
            ))}
            <Button variant="outline" className="justify-start" asChild>
              <Link href={`/actividades/${cita.id}/editar`}>
                <Pencil className="mr-2 h-4 w-4" /> Elegir otra fecha
              </Link>
            </Button>
            <Button variant="ghost" className="justify-start text-red-600" onClick={cancelar}>
              <X className="mr-2 h-4 w-4" /> Cancelar la cita
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
