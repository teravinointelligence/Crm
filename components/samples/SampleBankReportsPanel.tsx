"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, MessageSquareWarning, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatDate } from "@/lib/utils";

export type BankReport = {
  id: string;
  product_name: string;
  region: string | null;
  location: string | null;
  quantity: number;
  kind: "consumo" | "merma" | "regreso_almacen";
  note: string;
  reported_at: string | null;
  rep: string | null;
  account: string | null;
};

const KIND_LABEL: Record<BankReport["kind"], string> = {
  consumo: "Consumo con cliente",
  merma: "Merma",
  regreso_almacen: "Regresó al almacén",
};

// Reportes de botellas del banco que ya no están físicamente (consumo sin
// registrar, merma, regreso al almacén). El admin decide aquí; el vendedor ve
// los suyos pendientes. El banco solo se mueve al aprobar.
export function SampleBankReportsPanel({
  reports,
  isAdmin,
}: {
  reports: BankReport[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [pending, startTransition] = useTransition();
  const [rejecting, setRejecting] = useState<BankReport | null>(null);
  const [rejectNote, setRejectNote] = useState("");

  if (!reports.length) return null;

  const decide = (id: string, decision: "aprobado" | "rechazado", notes?: string) => {
    startTransition(async () => {
      const { error } = await supabase.rpc("sample_bank_report_decide", {
        p_report: id,
        p_decision: decision,
        p_notes: notes || null,
      });
      if (error) {
        toast.error("No se pudo decidir el reporte", { description: error.message });
        return;
      }
      toast.success(decision === "aprobado" ? "Reporte aprobado: el banco quedó ajustado" : "Reporte rechazado");
      setRejecting(null);
      router.refresh();
    });
  };

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center gap-2 text-sm font-medium">
          <MessageSquareWarning className="h-4 w-4 text-amber-600" />
          {isAdmin
            ? `Reportes de botellas por revisar (${reports.length})`
            : `Tus reportes pendientes (${reports.length})`}
        </div>
        {!isAdmin && (
          <p className="text-xs text-muted-foreground">
            El banco se ajusta cuando el admin apruebe el reporte; mientras tanto la botella sigue
            apareciendo como disponible.
          </p>
        )}
        <ul className="divide-y">
          {reports.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5 text-sm">
              <div className="min-w-0 space-y-0.5">
                <div className="font-medium">
                  {r.quantity} × {r.product_name}
                  <Badge variant={r.kind === "consumo" ? "muted" : "warning"} className="ml-2">
                    {KIND_LABEL[r.kind]}
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground">
                  {[
                    r.rep,
                    r.account ? `→ ${r.account}` : null,
                    r.region ?? "Sin zona",
                    r.location,
                    r.reported_at ? formatDate(r.reported_at) : null,
                  ].filter(Boolean).join(" · ")}
                </div>
                <div className="text-xs text-muted-foreground">{r.note}</div>
              </div>
              {isAdmin && (
                <div className="flex shrink-0 gap-2">
                  <Button size="sm" variant="outline" onClick={() => decide(r.id, "aprobado")} disabled={pending}>
                    <Check className="mr-1 h-4 w-4" /> Aprobar
                  </Button>
                  <Button size="sm" variant="ghost" className="text-red-600" onClick={() => { setRejecting(r); setRejectNote(""); }} disabled={pending}>
                    <X className="mr-1 h-4 w-4" /> Rechazar
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </CardContent>

      <Dialog open={!!rejecting} onOpenChange={(o) => !o && setRejecting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rechazar reporte</DialogTitle>
          </DialogHeader>
          {rejecting && (
            <div className="space-y-4">
              <div className="text-sm">
                {rejecting.quantity} × {rejecting.product_name} · {KIND_LABEL[rejecting.kind]}
                {rejecting.rep ? ` · ${rejecting.rep}` : ""}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="reject_note">Motivo (se le muestra al vendedor)</Label>
                <Input
                  id="reject_note"
                  value={rejectNote}
                  onChange={(e) => setRejectNote(e.target.value)}
                  placeholder="La botella sí está en la bodega…"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setRejecting(null)} disabled={pending}>
                  Cancelar
                </Button>
                <Button variant="destructive" onClick={() => decide(rejecting.id, "rechazado", rejectNote)} disabled={pending}>
                  {pending ? "Rechazando…" : "Rechazar"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
