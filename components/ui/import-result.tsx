"use client";

// Panel persistente con el resultado de una importación. Los toasts
// desaparecen a los segundos; esto deja constancia de cuántas filas se
// procesaron y cuáles fallaron, con un CTA al módulo que consume los datos.

import Link from "next/link";
import { CheckCircle2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export type ImportOutcome = {
  /** Filas procesadas con éxito. */
  ok: number;
  /** Qué se importó, ej. "ventas importadas para 2026-05". */
  okLabel: string;
  /** Detalle de las filas que NO se procesaron. */
  errors: string[];
  /** A dónde ver el resultado, ej. { href: "/ventas", label: "Ver ventas" }. */
  cta?: { href: string; label: string };
};

export function ImportResultPanel({ outcome }: { outcome: ImportOutcome }) {
  const { ok, okLabel, errors, cta } = outcome;
  return (
    <Card>
      <CardContent className="space-y-3 p-6">
        <h3 className="font-display text-lg">Resultado de la importación</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-md border bg-emerald-50 p-4 text-emerald-900">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" />
              <span className="font-medium">
                {ok} {okLabel}
              </span>
            </div>
          </div>
          <div
            className={`rounded-md border p-4 ${
              errors.length ? "bg-amber-50 text-amber-900" : "bg-muted/30 text-muted-foreground"
            }`}
          >
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              <span className="font-medium">
                {errors.length} fila{errors.length === 1 ? "" : "s"} no procesada{errors.length === 1 ? "" : "s"}
              </span>
            </div>
          </div>
        </div>
        {errors.length > 0 && (
          <details className="rounded-md border bg-amber-50 p-3 text-sm" open={errors.length <= 5}>
            <summary className="cursor-pointer font-medium text-amber-900">
              Ver detalle ({errors.length})
            </summary>
            <ul className="mt-2 space-y-1 text-xs text-amber-900">
              {errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          </details>
        )}
        {cta && (
          <div className="flex justify-end">
            <Button asChild>
              <Link href={cta.href}>{cta.label}</Link>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
