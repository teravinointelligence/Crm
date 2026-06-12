"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Mail, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MISSING_LABEL, type MissingFlag } from "@/lib/missing-data";

// Botón admin-only en la ficha del cliente: avisa por correo al vendedor
// asignado los datos que le faltan a ESTA cuenta en concreto.
export function EnviarDatosClienteButton({
  accountId,
  missing,
  repName,
  repEmail,
}: {
  accountId: string;
  missing: MissingFlag[];
  repName: string | null;
  repEmail: string | null;
}) {
  const [sending, setSending] = useState(false);
  const canSend = !!repEmail;

  const enviar = async () => {
    if (!window.confirm(`¿Avisar a ${repName ?? "el vendedor"} sobre los datos faltantes de este cliente?`)) return;
    setSending(true);
    try {
      const res = await fetch(`/api/cuentas/${accountId}/datos-faltantes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Error al enviar");
      toast.success(`Aviso enviado a ${json.repName}`, { description: json.to });
    } catch (err) {
      toast.error("No se pudo enviar", { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="rounded-lg border border-dashed border-amber-300 bg-amber-50/50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <div className="text-sm font-medium text-amber-900">Datos faltantes de este cliente</div>
          <div className="flex flex-wrap gap-1">
            {missing.map((m) => (
              <Badge key={m} variant="warning">
                {MISSING_LABEL[m]}
              </Badge>
            ))}
          </div>
          {!canSend && (
            <p className="text-xs text-muted-foreground">
              {repName ? "El vendedor asignado no tiene email registrado." : "Esta cuenta no tiene vendedor asignado."}
            </p>
          )}
        </div>
        <Button size="sm" variant="outline" onClick={enviar} disabled={sending || !canSend}>
          {sending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Mail className="mr-1 h-3.5 w-3.5" />}
          Avisar al vendedor
        </Button>
      </div>
    </div>
  );
}
