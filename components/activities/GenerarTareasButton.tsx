"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/**
 * Dispara a mano el generador de tareas (lo mismo que corre el cron cada
 * mañana). Sirve para probarlo el primer día y para refrescar después de
 * cargar pagos o facturas.
 */
export function GenerarTareasButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const run = () => {
    startTransition(async () => {
      try {
        const res = await fetch("/api/cron/agenda-tareas", { method: "POST" });
        const json = await res.json();
        if (!res.ok || !json.ok) {
          toast.error("No se pudieron generar", { description: json.error ?? res.statusText });
          return;
        }
        toast.success(
          `${json.creadas} nuevas · ${json.refrescadas} actualizadas · ${json.resueltas} cerradas solas`,
          json.omitidas ? { description: `${json.omitidas} quedaron para la próxima corrida` } : undefined,
        );
        router.refresh();
      } catch (e) {
        toast.error("No se pudieron generar", {
          description: e instanceof Error ? e.message : String(e),
        });
      }
    });
  };

  return (
    <Button variant="outline" onClick={run} disabled={pending}>
      {pending ? (
        <Loader2 className="mr-1 h-4 w-4 animate-spin" />
      ) : (
        <RefreshCw className="mr-1 h-4 w-4" />
      )}
      Generar tareas
    </Button>
  );
}
