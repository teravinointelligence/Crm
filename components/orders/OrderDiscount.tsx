"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { BadgePercent, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/utils";
import { MAX_VENDOR_DISCOUNT_PCT, type DiscountStatus } from "@/lib/pricing";

const STATUS_BADGE: Record<DiscountStatus, { label: string; variant: "muted" | "success" | "warning" | "danger" }> = {
  none: { label: "Sin descuento", variant: "muted" },
  pendiente: { label: "Pendiente de autorización", variant: "warning" },
  autorizado: { label: "Autorizado", variant: "success" },
  rechazado: { label: "Rechazado", variant: "danger" },
};

export function OrderDiscount({
  orderId,
  repId,
  isAdmin,
  canEdit,
  pct,
  status,
  amount,
  requestedBy,
  authorizedBy,
  note,
}: {
  orderId: string;
  repId: string;
  isAdmin: boolean;
  canEdit: boolean;
  pct: number;
  status: DiscountStatus;
  amount: number;
  requestedBy: string | null;
  authorizedBy: string | null;
  note: string | null;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [pending, startTransition] = useTransition();
  const [input, setInput] = useState(pct || 0);

  // Sin descuento y sin permiso para ponerlo → no mostramos la tarjeta.
  if (status === "none" && !isAdmin && !canEdit) return null;

  const run = (patch: Record<string, unknown>, ok: string) => {
    startTransition(async () => {
      const { error } = await supabase.from("orders").update(patch).eq("id", orderId);
      if (error) {
        toast.error("No se pudo actualizar el descuento", { description: error.message });
        return;
      }
      toast.success(ok);
      router.refresh();
    });
  };

  const applyDiscount = () => {
    const next = Math.max(0, Math.min(100, input || 0));
    run(
      {
        discount_pct: next,
        discount_requested_by: repId,
        ...(isAdmin && next > 0
          ? { discount_authorized_by: repId, discount_authorized_at: new Date().toISOString(), discount_note: null }
          : {}),
        ...(next === 0 ? { discount_status: "none", discount_note: null } : {}),
      },
      next === 0 ? "Descuento quitado" : isAdmin ? "Descuento aplicado" : "Descuento guardado",
    );
  };

  const authorize = () =>
    run(
      { discount_authorized_by: repId, discount_authorized_at: new Date().toISOString(), discount_status: "autorizado", discount_note: null },
      "Descuento autorizado",
    );

  const reject = () => {
    const motivo = window.prompt("Motivo del rechazo (opcional):") ?? "";
    run({ discount_status: "rechazado", discount_note: motivo || null }, "Descuento rechazado");
  };

  const badge = STATUS_BADGE[status];

  return (
    <Card>
      <CardContent className="space-y-4 p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 font-display text-lg">
            <BadgePercent className="h-5 w-5 text-brand-carmesi" /> Descuento
          </h3>
          <Badge variant={badge.variant}>{badge.label}</Badge>
        </div>

        {status !== "none" && (
          <div className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{pct}%</span>
            {amount > 0 && <span> · − {formatCurrency(amount)} aplicado</span>}
            {requestedBy && <div>Solicitó: {requestedBy}</div>}
            {authorizedBy && status === "autorizado" && <div>Autorizó: {authorizedBy}</div>}
            {note && <div>Nota: {note}</div>}
          </div>
        )}

        {/* Autorización admin de un descuento pendiente */}
        {isAdmin && status === "pendiente" && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={authorize} disabled={pending}>
              <Check className="mr-1 h-4 w-4" /> Autorizar {pct}%
            </Button>
            <Button size="sm" variant="outline" className="text-red-600" onClick={reject} disabled={pending}>
              <X className="mr-1 h-4 w-4" /> Rechazar
            </Button>
          </div>
        )}

        {/* Aplicar / ajustar el % (admin siempre; vendedor dueño si la orden es editable) */}
        {(isAdmin || canEdit) && (
          <div className="flex flex-wrap items-end gap-2 border-t pt-3">
            <div className="space-y-1">
              <Label htmlFor="disc_pct" className="text-xs text-muted-foreground">
                {isAdmin ? "Aplicar descuento (%)" : "Solicitar descuento (%)"}
              </Label>
              <Input
                id="disc_pct"
                type="number"
                min={0}
                max={100}
                step="0.5"
                value={input}
                onChange={(e) => setInput(Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
                className="h-9 w-24 text-right"
              />
            </div>
            <Button size="sm" onClick={applyDiscount} disabled={pending}>
              {isAdmin ? "Aplicar" : "Guardar"}
            </Button>
            {!isAdmin && input > MAX_VENDOR_DISCOUNT_PCT && (
              <p className="w-full text-xs text-amber-700">
                {MAX_VENDOR_DISCOUNT_PCT > 0
                  ? `Arriba de ${MAX_VENDOR_DISCOUNT_PCT}% queda`
                  : "Queda"}{" "}
                pendiente de autorización del admin.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
