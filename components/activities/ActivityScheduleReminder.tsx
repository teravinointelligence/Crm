"use client";

import { useState } from "react";
import { CalendarCheck2, Mail, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type Props = {
  seller: { id: string; name: string; email: string | null };
  month: string;
  monthLabel: string;
  futureActivitiesCount: number;
};

export function ActivityScheduleReminder({
  seller,
  month,
  monthLabel,
  futureActivitiesCount,
}: Props) {
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);

  if (futureActivitiesCount > 0) {
    return (
      <div
        role="status"
        className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"
      >
        <CalendarCheck2 className="h-4 w-4 shrink-0" />
        <span>
          <strong>{seller.name}</strong> tiene {futureActivitiesCount}{" "}
          {futureActivitiesCount === 1 ? "actividad futura" : "actividades futuras"} en {monthLabel}.
        </span>
      </div>
    );
  }

  const hasEmail = Boolean(seller.email?.trim());

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
      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
    >
      <div className="flex min-w-0 items-start gap-2">
        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
        <div>
          <p>
            <strong>{seller.name}</strong> no tiene actividades futuras registradas para {monthLabel}.
          </p>
          {!hasEmail && (
            <p className="mt-0.5 text-xs text-amber-700">
              Agrega su correo en el perfil del vendedor para poder enviarle el recordatorio.
            </p>
          )}
        </div>
      </div>
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
    </div>
  );
}
