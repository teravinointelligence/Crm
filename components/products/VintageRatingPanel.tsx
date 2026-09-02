import { Award } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { VintageRating } from "@/lib/vintage-chart/resolve";

function scoreVariant(top: number): "success" | "default" | "warning" {
  if (top >= 90) return "success";
  if (top >= 83) return "default";
  return "warning";
}

/**
 * Muestra la calificación de añada del Robert Parker Wine Advocate Vintage Chart
 * para el vino de la ficha. Es un dato REGIONAL de la añada (no la calificación
 * del vino en específico), con atribución a RP. Se renderiza sólo cuando hay un
 * match confiable (`resolveVintageRating` devolvió algo).
 */
export function VintageRatingPanel({ rating }: { rating: VintageRating }) {
  const top = rating.scoreHigh ?? rating.scoreLow;
  const scoreText = rating.isRange
    ? `${rating.scoreLow}–${rating.scoreHigh}`
    : String(rating.scoreLow);

  return (
    <Card>
      <CardContent className="space-y-3 p-6">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <Award className="h-4 w-4" />
          Añada · Robert Parker Wine Advocate
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-baseline gap-1">
            <span className="font-display text-4xl leading-none">{scoreText}</span>
            <span className="text-sm text-muted-foreground">/ 100</span>
          </div>
          <div className="space-y-1">
            <Badge variant={scoreVariant(top)}>{rating.band}</Badge>
            <div className="text-sm text-muted-foreground">
              {rating.regionLabel} · añada {rating.year}
            </div>
          </div>
        </div>

        <p className="text-sm font-medium">{rating.salesHint}</p>

        <div className="flex flex-wrap gap-2">
          {rating.maturityLabel && (
            <Badge variant="outline">{rating.maturityLabel}</Badge>
          )}
          {rating.isRange && (
            <Badge variant="muted">Calificación preliminar (en barrica)</Badge>
          )}
        </div>

        <p className="border-t pt-3 text-xs leading-relaxed text-muted-foreground">
          Calidad de la añada <strong>en la región</strong> ({rating.rpName}), según el
          Vintage Chart de Robert Parker Wine Advocate — no es la calificación del vino en
          específico. Fuente: suscripción de Teravino a Wine Advocate.
        </p>
      </CardContent>
    </Card>
  );
}
