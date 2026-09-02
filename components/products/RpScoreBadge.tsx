import { Badge } from "@/components/ui/badge";
import type { VintageRating } from "@/lib/vintage-chart/resolve";

function variantFor(top: number): "success" | "default" | "warning" {
  if (top >= 90) return "success";
  if (top >= 83) return "default";
  return "warning";
}

/**
 * Badge compacto "RP 97" con la calificación de añada de RP Wine Advocate para
 * la región del vino. Para listados (catálogo). El `title` da el detalle al
 * pasar el cursor; el panel completo vive en la ficha del producto.
 */
export function RpScoreBadge({ rating }: { rating: VintageRating }) {
  const top = rating.scoreHigh ?? rating.scoreLow;
  const score = rating.isRange
    ? `${rating.scoreLow}–${rating.scoreHigh}`
    : String(rating.scoreLow);
  const title = `${rating.regionLabel} · añada ${rating.year} — ${rating.band}${
    rating.maturityLabel ? ` · ${rating.maturityLabel}` : ""
  } (Robert Parker Wine Advocate)`;

  return (
    <Badge variant={variantFor(top)} title={title} className="shrink-0">
      RP {score}
    </Badge>
  );
}
