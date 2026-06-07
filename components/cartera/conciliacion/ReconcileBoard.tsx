"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Sparkles, Check, Ban, Undo2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { ReconcileSuggestion } from "@/lib/bank/types";
import { ReconcileConfirmDialog } from "./ReconcileConfirmDialog";

export type BoardTxn = {
  id: string;
  txn_date: string | null;
  description: string;
  reference: string | null;
  amount: number;
  kind: "abono" | "cargo";
  estado_conciliacion: "sin_conciliar" | "sugerido" | "conciliado" | "ignorado";
  suggestion: ReconcileSuggestion | null;
};

const ESTADO_BADGE: Record<BoardTxn["estado_conciliacion"], { label: string; variant: "success" | "warning" | "muted" | "accent" }> = {
  sin_conciliar: { label: "Sin conciliar", variant: "warning" },
  sugerido: { label: "Sugerido", variant: "accent" },
  conciliado: { label: "Conciliado", variant: "success" },
  ignorado: { label: "Ignorado", variant: "muted" },
};

export function ReconcileBoard({ statementId, txns }: { statementId: string; txns: BoardTxn[] }) {
  const router = useRouter();
  const [matching, setMatching] = useState(false);

  const abonos = txns.filter((t) => t.kind === "abono");
  const cargos = txns.filter((t) => t.kind === "cargo");
  const pendientes = abonos.filter((t) => t.estado_conciliacion === "sin_conciliar" || t.estado_conciliacion === "sugerido");

  const runMatch = async () => {
    setMatching(true);
    try {
      const res = await fetch(`/api/cartera/conciliacion/${statementId}/match`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Error al sugerir");
      toast.success(`${json.suggested} sugerencias generadas`, {
        description: json.claude ? `${json.claude} resueltas con IA` : undefined,
      });
      router.refresh();
    } catch (err) {
      toast.error("No pudimos generar sugerencias", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setMatching(false);
    }
  };

  const setEstado = async (id: string, action: "ignore" | "reset") => {
    try {
      const res = await fetch(`/api/cartera/conciliacion/${statementId}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transaction_id: id, action }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Error");
      router.refresh();
    } catch (err) {
      toast.error("No se pudo actualizar", { description: err instanceof Error ? err.message : String(err) });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-4">
        <div className="text-sm">
          <span className="font-medium">{abonos.length}</span> abonos ·{" "}
          <span className="font-medium">{cargos.length}</span> cargos ·{" "}
          <span className="font-medium text-amber-700">{pendientes.length}</span> por conciliar
        </div>
        <Button onClick={runMatch} disabled={matching || pendientes.length === 0}>
          {matching ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1 h-4 w-4" />}
          {matching ? "Analizando…" : "Generar sugerencias"}
        </Button>
      </div>

      {/* Abonos */}
      <section className="space-y-2">
        <h2 className="font-display text-lg">Abonos (depósitos)</h2>
        {abonos.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay abonos en este estado de cuenta.</p>
        ) : (
          <Card>
            <CardContent className="p-0">
              <ul className="divide-y">
                {abonos.map((t) => {
                  const badge = ESTADO_BADGE[t.estado_conciliacion];
                  const sug = t.suggestion;
                  const done = t.estado_conciliacion === "conciliado";
                  const ignored = t.estado_conciliacion === "ignorado";
                  return (
                    <li key={t.id} className="flex flex-wrap items-start justify-between gap-3 p-4">
                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-emerald-700">{formatCurrency(t.amount)}</span>
                          <Badge variant={badge.variant}>{badge.label}</Badge>
                          <span className="text-xs text-muted-foreground">{t.txn_date ? formatDate(t.txn_date) : ""}</span>
                        </div>
                        <div className="text-sm">{t.description}</div>
                        {t.reference && <div className="text-xs text-muted-foreground">Ref: {t.reference}</div>}
                        {sug && sug.candidates.length > 0 && !done && (
                          <div className="text-xs text-muted-foreground">
                            → {sug.account_name} ({sug.candidates.map((c) => c.invoice_number).join(", ")}) ·{" "}
                            <span className="italic">{sug.reason}</span>
                          </div>
                        )}
                      </div>
                      {!done && !ignored && (
                        <div className="flex shrink-0 gap-2">
                          <ReconcileConfirmDialog
                            statementId={statementId}
                            txn={t}
                            suggestion={sug}
                            trigger={
                              <Button size="sm">
                                <Check className="mr-1 h-3.5 w-3.5" /> Conciliar
                              </Button>
                            }
                          />
                          <Button size="sm" variant="ghost" onClick={() => setEstado(t.id, "ignore")}>
                            <Ban className="mr-1 h-3.5 w-3.5" /> Ignorar
                          </Button>
                        </div>
                      )}
                      {(done || ignored) && (
                        <Button size="sm" variant="ghost" onClick={() => setEstado(t.id, "reset")}>
                          <Undo2 className="mr-1 h-3.5 w-3.5" /> Reabrir
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>
        )}
      </section>

      {/* Cargos no identificados */}
      {cargos.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-display text-lg">Cargos (no identificados)</h2>
          <Card>
            <CardContent className="p-0">
              <table className="min-w-full text-sm">
                <thead className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2">Fecha</th>
                    <th className="px-4 py-2">Concepto</th>
                    <th className="px-4 py-2">Referencia</th>
                    <th className="px-4 py-2 text-right">Monto</th>
                  </tr>
                </thead>
                <tbody>
                  {cargos.map((t) => (
                    <tr key={t.id} className="border-b last:border-b-0">
                      <td className="px-4 py-2 text-muted-foreground">{t.txn_date ? formatDate(t.txn_date) : "—"}</td>
                      <td className="px-4 py-2">{t.description}</td>
                      <td className="px-4 py-2 text-muted-foreground">{t.reference ?? "—"}</td>
                      <td className="px-4 py-2 text-right">{formatCurrency(t.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </section>
      )}
    </div>
  );
}
