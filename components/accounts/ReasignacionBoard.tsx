"use client";

// Panel admin de reasignación por inactividad: cuentas en cuenta regresiva
// (con aviso enviado) y bitácora de reasignaciones recientes, más botones para
// simular o ejecutar el barrido a mano (el cron lo corre solo a diario).

import Link from "next/link";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlarmClock, Play, FlaskConical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import type { AtRiskAccount, ReassignmentLogRow } from "@/lib/reasignacion-inactivas";

function fecha(iso: string): string {
  return new Date(iso).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });
}

export function ReasignacionBoard({
  atRisk,
  recent,
}: {
  atRisk: AtRiskAccount[];
  recent: ReassignmentLogRow[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const run = (dryRun: boolean) => {
    startTransition(async () => {
      try {
        const res = await fetch("/api/cuentas/reasignacion/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dryRun }),
        });
        const data = await res.json();
        if (!res.ok) {
          toast.error("No se pudo ejecutar", { description: data?.error ?? "Error" });
          return;
        }
        const resumen = `${data.warned} aviso(s) · ${data.reassigned} reasignada(s) · ${data.recovered} reactivada(s) · ${data.pending} en plazo`;
        if (dryRun) {
          toast.info("Simulación (no se escribió nada)", { description: resumen });
        } else {
          toast.success("Barrido ejecutado", { description: `${resumen} · ${data.emailsSent} correo(s)` });
          router.refresh();
        }
      } catch (e) {
        toast.error("No se pudo ejecutar", {
          description: e instanceof Error ? e.message : "Error",
        });
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => run(true)} variant="outline" disabled={pending}>
          <FlaskConical className="mr-1 h-4 w-4" /> Simular
        </Button>
        <Button onClick={() => run(false)} disabled={pending}>
          <Play className="mr-1 h-4 w-4" /> {pending ? "Ejecutando…" : "Ejecutar ahora"}
        </Button>
      </div>

      <section className="space-y-2">
        <h2 className="flex items-center gap-2 font-display text-xl">
          <AlarmClock className="h-5 w-5 text-amber-600" /> En cuenta regresiva ({atRisk.length})
        </h2>
        {atRisk.length === 0 ? (
          <EmptyState
            title="Ninguna en riesgo"
            description="No hay cuentas con aviso de reasignación pendiente."
          />
        ) : (
          <Card>
            <CardContent className="p-0">
              <table className="min-w-full text-sm">
                <thead className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Cuenta</th>
                    <th className="px-4 py-3">Vendedor</th>
                    <th className="px-4 py-3">Avisado</th>
                    <th className="px-4 py-3 text-right">Plazo</th>
                  </tr>
                </thead>
                <tbody>
                  {atRisk.map((a) => (
                    <tr key={a.account_id} className="border-b last:border-b-0">
                      <td className="px-4 py-3 font-medium">
                        <Link href={`/cuentas/${a.account_id}`} className="hover:text-brand-carmesi">
                          {a.business_name}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{a.rep_name}</td>
                      <td className="px-4 py-3 text-muted-foreground">{fecha(a.warned_at)}</td>
                      <td className="px-4 py-3 text-right">
                        <span
                          className={
                            a.dias_restantes <= 0
                              ? "font-medium text-red-600"
                              : a.dias_restantes <= 3
                                ? "font-medium text-amber-600"
                                : ""
                          }
                        >
                          {a.dias_restantes <= 0
                            ? "Se reasigna en el próximo barrido"
                            : `Te quedan ${a.dias_restantes} ${a.dias_restantes === 1 ? "día" : "días"}`}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="font-display text-xl">Reasignadas recientemente</h2>
        {recent.length === 0 ? (
          <EmptyState title="Sin historial" description="Aún no se ha reasignado ninguna cuenta." />
        ) : (
          <Card>
            <CardContent className="p-0">
              <table className="min-w-full text-sm">
                <thead className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Cuenta</th>
                    <th className="px-4 py-3">Vendedor anterior</th>
                    <th className="px-4 py-3">Fecha</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((r) => (
                    <tr key={r.id} className="border-b last:border-b-0">
                      <td className="px-4 py-3 font-medium">
                        <Link href={`/cuentas/${r.account_id}`} className="hover:text-brand-carmesi">
                          {r.business_name ?? "—"}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{r.from_rep_name}</td>
                      <td className="px-4 py-3 text-muted-foreground">{fecha(r.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
}
