"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, Trash2, CalendarDays, Wine, Tag, Package } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate } from "@/lib/utils";
import { PromocionForm, PROMO_TYPE_LABELS, type PromoRow } from "./PromocionForm";

const TYPE_VARIANT: Record<string, "default" | "accent" | "success" | "warning" | "muted"> = {
  descuento: "success",
  bonificacion: "accent",
  paquete: "warning",
  temporada: "default",
  otro: "muted",
};

function bonificacionLabel(bonus_per: number | null, bonus_qty: number | null) {
  if (!bonus_per || !bonus_qty) return null;
  return `${bonus_per + bonus_qty}×${bonus_per} (lleva ${bonus_per + bonus_qty}, paga ${bonus_per})`;
}

export function PromocionCard({
  promo,
  isAdmin,
  products,
  repId,
}: {
  promo: PromoRow;
  isAdmin: boolean;
  products: { id: string; name: string; supplier: string | null }[];
  repId: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();

  const today = new Date().toISOString().slice(0, 10);
  const expired = promo.valid_to ? promo.valid_to < today : false;
  const notStarted = promo.valid_from ? promo.valid_from > today : false;

  function handleDelete() {
    if (!confirm(`¿Eliminar la promoción "${promo.title}"?`)) return;
    startTransition(async () => {
      const supabase = createClient();
      const { error } = await supabase.from("promotions").delete().eq("id", promo.id);
      if (error) {
        toast.error("Error al eliminar", { description: error.message });
        return;
      }
      toast.success("Promoción eliminada");
      router.refresh();
    });
  }

  return (
    <>
      <Card className={!promo.active || expired ? "opacity-60" : ""}>
        <CardContent className="space-y-3 p-5">
          {/* Header */}
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-semibold leading-tight">{promo.title}</h3>
                {!promo.active && <Badge variant="muted">Inactiva</Badge>}
                {promo.active && expired && <Badge variant="danger">Vencida</Badge>}
                {promo.active && notStarted && <Badge variant="warning">Próxima</Badge>}
                {promo.active && !expired && !notStarted && <Badge variant="success">Vigente</Badge>}
              </div>
              <div className="mt-1 flex flex-wrap gap-2">
                <Badge variant={TYPE_VARIANT[promo.promo_type] ?? "muted"}>
                  {PROMO_TYPE_LABELS[promo.promo_type] ?? promo.promo_type}
                </Badge>
              </div>
            </div>
            {isAdmin && (
              <div className="flex shrink-0 gap-1">
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditing(true)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 text-destructive hover:text-destructive"
                  onClick={handleDelete}
                  disabled={pending}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
          </div>

          {/* Producto */}
          {promo.product_name && (
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Wine className="h-3.5 w-3.5 shrink-0" />
              <span>{promo.product_name}</span>
            </div>
          )}

          {/* Condiciones */}
          {promo.promo_type === "descuento" && promo.discount_pct != null && (
            <div className="flex items-center gap-1.5 text-sm font-medium text-emerald-700">
              <Tag className="h-3.5 w-3.5" />
              <span>{promo.discount_pct}% de descuento</span>
            </div>
          )}

          {promo.promo_type === "bonificacion" && (promo.bonus_per || promo.bonus_qty) && (
            <div className="flex items-center gap-1.5 text-sm font-medium text-accent-foreground">
              <Package className="h-3.5 w-3.5" />
              <span>{bonificacionLabel(promo.bonus_per, promo.bonus_qty) ?? `+${promo.bonus_qty} de bonificación c/${promo.bonus_per}`}</span>
            </div>
          )}

          {/* Descripción */}
          {promo.description && (
            <p className="text-sm text-muted-foreground whitespace-pre-line">{promo.description}</p>
          )}

          {/* Vigencia */}
          {(promo.valid_from || promo.valid_to) && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <CalendarDays className="h-3.5 w-3.5" />
              <span>
                {promo.valid_from ? formatDate(promo.valid_from) : "—"}
                {" → "}
                {promo.valid_to ? formatDate(promo.valid_to) : "sin fecha de fin"}
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      <PromocionForm
        open={editing}
        onClose={() => setEditing(false)}
        products={products}
        repId={repId}
        initial={promo}
      />
    </>
  );
}
