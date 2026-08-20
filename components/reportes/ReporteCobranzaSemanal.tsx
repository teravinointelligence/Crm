"use client";

// Tarjeta de control del reporte semanal de cobranza (Reportes).
// El envío automático corre solo los lunes vía Vercel Cron; aquí el admin puede
// (1) ver a quién le tocaría y con qué números, y (2) dispararlo fuera de
// calendario — a los destinatarios reales o a un correo de prueba.

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Mail, Eye, FlaskConical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatCurrency } from "@/lib/utils";

type PlanItem = {
  tipo: "general" | "vendedor";
  destinatario: string;
  etiqueta: string;
  subject: string;
  clientes: number;
  html: string;
};

type Preview = {
  clientesVencidos: number;
  saldoVencido: number;
  creditoSuspendido: number;
  saldoSuspendido: number;
  legacyExcluidas: number;
  vendedoresSinEmail: string[];
  plan: PlanItem[];
};

export function ReporteCobranzaSemanal({ isAdmin }: { isAdmin: boolean }) {
  const [pending, startTransition] = useTransition();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [verHtml, setVerHtml] = useState<PlanItem | null>(null);
  const [testEmail, setTestEmail] = useState("");

  const cargarPreview = () => {
    startTransition(async () => {
      const res = await fetch("/api/reportes/cobranza-semanal");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("No se pudo preparar el reporte", {
          description: data.error ?? `HTTP ${res.status}`,
        });
        return;
      }
      setPreview(data as Preview);
    });
  };

  const enviar = (test: string | null) => {
    startTransition(async () => {
      const res = await fetch("/api/reportes/cobranza-semanal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(test ? { test } : {}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("No se pudo enviar el reporte", {
          description: data.error ?? (data.errores ?? []).join(" · ") ?? `HTTP ${res.status}`,
        });
        return;
      }
      const n = (data.enviados ?? []).length;
      toast.success(test ? "Prueba enviada" : "Reporte enviado", {
        description: test ? `${n} correo${n === 1 ? "" : "s"} a ${test}` : `${n} correo${n === 1 ? "" : "s"} enviados`,
      });
      setPreview(null);
    });
  };

  const generales = preview?.plan.filter((p) => p.tipo === "general") ?? [];
  const vendedores = preview?.plan.filter((p) => p.tipo === "vendedor") ?? [];

  return (
    <Card>
      <CardContent className="space-y-4 p-6">
        <div>
          <h2 className="font-display text-xl">Reporte semanal de cobranza</h2>
          <p className="text-sm text-muted-foreground">
            Cada <strong>lunes</strong> se envía automáticamente el resumen de cartera vencida a
            Pedidos y Contabilidad, y a cada vendedor su propia cartera con los clientes de crédito
            suspendido. Aquí puedes revisarlo o mandarlo fuera de calendario.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={cargarPreview} disabled={pending}>
            <Eye className="mr-1 h-4 w-4" />
            {pending && !preview ? "Calculando…" : "Ver vista previa"}
          </Button>
        </div>

        <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
          <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Reporte semanal de cobranza</DialogTitle>
            </DialogHeader>
            {preview && (
              <div className="space-y-4 text-sm">
                <div className="grid grid-cols-2 gap-3 rounded-md border bg-muted/30 p-3">
                  <Dato label="Clientes con saldo vencido" valor={String(preview.clientesVencidos)} />
                  <Dato label="Saldo vencido total" valor={formatCurrency(preview.saldoVencido)} tone />
                  <Dato label="Crédito a suspender" valor={String(preview.creditoSuspendido)} tone />
                  <Dato label="Saldo en suspensión" valor={formatCurrency(preview.saldoSuspendido)} tone />
                </div>

                <Seccion titulo="Resumen general" items={generales} onVer={setVerHtml} />
                <Seccion titulo="Un correo por vendedor" items={vendedores} onVer={setVerHtml} />

                {preview.vendedoresSinEmail.length > 0 && (
                  <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
                    Sin correo registrado (o dados de baja), no reciben nada:{" "}
                    {preview.vendedoresSinEmail.join(", ")}.
                  </p>
                )}
                {preview.legacyExcluidas > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {preview.legacyExcluidas} cuenta(s) marcadas como cartera legacy quedan fuera del
                    reporte por política.
                  </p>
                )}

                {isAdmin && (
                  <div className="space-y-3 border-t pt-4">
                    <div className="space-y-1">
                      <p className="text-xs font-medium">Enviar una prueba</p>
                      <p className="text-xs text-muted-foreground">
                        Manda TODOS los correos a una sola dirección, con el asunto marcado como
                        prueba. Ni los vendedores ni contabilidad reciben nada.
                      </p>
                      <div className="flex gap-2">
                        <Input
                          type="email"
                          placeholder="tucorreo@teravino.com"
                          value={testEmail}
                          onChange={(e) => setTestEmail(e.target.value)}
                        />
                        <Button
                          variant="outline"
                          disabled={pending || !testEmail.includes("@")}
                          onClick={() => enviar(testEmail.trim())}
                        >
                          <FlaskConical className="mr-1 h-4 w-4" />
                          {pending ? "Enviando…" : "Probar"}
                        </Button>
                      </div>
                    </div>

                    <div className="flex justify-end gap-2 border-t pt-3">
                      <Button variant="outline" onClick={() => setPreview(null)} disabled={pending}>
                        Cancelar
                      </Button>
                      <Button onClick={() => enviar(null)} disabled={pending}>
                        <Mail className="mr-1 h-4 w-4" />
                        {pending
                          ? "Enviando…"
                          : `Enviar ahora a ${preview.plan.length} destinatario${preview.plan.length === 1 ? "" : "s"}`}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>

        <Dialog open={!!verHtml} onOpenChange={(o) => !o && setVerHtml(null)}>
          <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-base">{verHtml?.subject}</DialogTitle>
            </DialogHeader>
            {verHtml && (
              <>
                <p className="text-xs text-muted-foreground">Para: {verHtml.destinatario}</p>
                <iframe
                  title="Vista previa del correo"
                  sandbox=""
                  srcDoc={verHtml.html}
                  className="h-[60vh] w-full rounded-md border bg-white"
                />
              </>
            )}
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

function Dato({ label, valor, tone }: { label: string; valor: string; tone?: boolean }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`font-display text-lg ${tone ? "text-red-700" : ""}`}>{valor}</p>
    </div>
  );
}

function Seccion({
  titulo,
  items,
  onVer,
}: {
  titulo: string;
  items: PlanItem[];
  onVer: (p: PlanItem) => void;
}) {
  if (!items.length) return null;
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {titulo} ({items.length})
      </p>
      <ul className="divide-y rounded-md border">
        {items.map((p) => (
          <li key={`${p.tipo}-${p.destinatario}`} className="flex items-center justify-between gap-3 p-2">
            <div className="min-w-0">
              <p className="truncate font-medium">{p.etiqueta}</p>
              <p className="truncate text-xs text-muted-foreground">
                {p.destinatario} · {p.clientes} cliente{p.clientes === 1 ? "" : "s"}
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => onVer(p)}>
              Ver correo
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
