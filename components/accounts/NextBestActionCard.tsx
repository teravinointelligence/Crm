"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Sparkles, Loader2, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

// Resumen "Next Best Action" generado on-demand. Los hechos (cartera, churn,
// qué compra, cross-sell) se muestran en las otras tarjetas; aquí el LLM los
// sintetiza en un estado + UNA siguiente acción. El vendedor lee y decide.
export function NextBestActionCard({ accountId, basis }: { accountId: string; basis: string }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ resumen: string; accion: string } | null>(null);

  const generate = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/cuentas/${accountId}/next-best-action`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo generar el resumen.");
      setResult({ resumen: data.resumen, accion: data.accion });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al generar el resumen.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="border-brand-carmesi/30 bg-brand-carmesi/5">
      <CardContent className="space-y-3 p-5">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-brand-carmesi" />
          <h3 className="font-display text-lg">Next Best Action</h3>
          {!result && (
            <Button size="sm" className="ml-auto" onClick={generate} disabled={loading}>
              {loading ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1 h-4 w-4" />}
              Generar resumen
            </Button>
          )}
        </div>

        {result ? (
          <div className="space-y-3">
            <p className="text-sm">{result.resumen}</p>
            <div className="flex items-start gap-2 rounded-md border border-brand-carmesi/30 bg-background p-3">
              <Target className="mt-0.5 h-4 w-4 shrink-0 text-brand-carmesi" />
              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Siguiente acción</div>
                <div className="text-sm font-medium">{result.accion}</div>
              </div>
            </div>
            <button onClick={generate} disabled={loading} className="text-xs text-muted-foreground hover:text-foreground">
              {loading ? "Regenerando…" : "↻ Regenerar"}
            </button>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Resumen del estado de la cuenta y la siguiente acción recomendada, basado en: {basis}.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
