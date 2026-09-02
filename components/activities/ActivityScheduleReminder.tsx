"use client";

import { useState } from "react";
import {
  CalendarClock,
  CheckCircle2,
  ListTodo,
  Mail,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { ActivityMonthSummary } from "@/lib/activity-schedule-reminder";

type Props = {
  seller: { id: string; name: string; email: string | null };
  month: string;
  monthLabel: string;
  summary: ActivityMonthSummary;
};

export function ActivityScheduleReminder({
  seller,
  month,
  monthLabel,
  summary,
}: Props) {
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);

  const hasEmail = Boolean(seller.email?.trim());
  const hasFutureSchedule = summary.futureScheduled > 0;

  const send = async () => {
    if (!hasEmail || !seller.email) return;
    const confirmed = window.confirm(
      `¿Enviar a ${seller.name} (${seller.email}) el recordatorio para registrar actividades de ${monthLabel}? Recibirás una copia.`,
    );
    if (!confirmed) return;

    setPending(true);
    try {
      const response = await fetch("/api/recordatorios/actividades-vendedor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repId: seller.id, month }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error("No se pudo enviar el recordatorio", {
          description: data.error ?? `HTTP ${response.status}`,
        });
        return;
      }
      setSent(true);
      toast.success(`Recordatorio enviado a ${seller.name}`, {
        description: `${data.to} · recibiste copia en ${data.cc}`,
      });
    } catch (error) {
      toast.error("No se pudo enviar el recordatorio", {
        description: error instanceof Error ? error.message : "Error de conexión",
      });
    } finally {
      setPending(false);
    }
  };

  return (
    <div
      role="status"
      className="rounded-lg border border-border bg-card px-4 py-4 text-sm shadow-sm"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-medium">
            Actividad de <strong>{seller.name}</strong>
          </p>
          <p className="text-xs capitalize text-muted-foreground">{monthLabel}</p>
        </div>
        {!hasFutureSchedule && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={send}
            disabled={!hasEmail || pending || sent}
            className="border-amber-300 bg-white hover:bg-amber-100"
          >
            <Mail className="mr-1.5 h-4 w-4" />
            {pending ? "Enviando…" : sent ? "Recordatorio enviado" : "Enviar recordatorio"}
          </Button>
        )}
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <div className="flex items-center gap-2 rounded-md bg-blue-50 px-3 py-2 text-blue-950">
          <CalendarClock className="h-4 w-4 shrink-0 text-blue-700" />
          <span>
            <strong>{summary.futureScheduled}</strong> futuras agendadas
          </span>
        </div>
        <div className="flex items-center gap-2 rounded-md bg-emerald-50 px-3 py-2 text-emerald-950">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-700" />
          <span>
            <strong>{summary.completed}</strong> realizadas del mes
          </span>
        </div>
        <div className="flex items-center gap-2 rounded-md bg-violet-50 px-3 py-2 text-violet-950">
          <ListTodo className="h-4 w-4 shrink-0 text-violet-700" />
          <span>
            <strong>{summary.nextSteps}</strong> siguientes pasos
          </span>
        </div>
      </div>

      <div
        className={`mt-3 flex items-start gap-2 rounded-md px-3 py-2 ${
          hasFutureSchedule
            ? "bg-emerald-50 text-emerald-900"
            : "bg-amber-50 text-amber-950"
        }`}
      >
        {hasFutureSchedule ? (
          <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
        ) : (
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
        )}
        <div>
          <p>
            {hasFutureSchedule
              ? `${seller.name} tiene planeación futura registrada para ${monthLabel}.`
              : `${seller.name} no tiene actividades futuras agendadas para ${monthLabel}.`}
          </p>
          {!hasFutureSchedule && !hasEmail && (
            <p className="mt-0.5 text-xs text-amber-700">
              Agrega su correo en el perfil del vendedor para poder enviarle el recordatorio.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
