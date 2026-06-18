// Tarjetas presentacionales de inteligencia por cuenta (churn + cross-sell).
// Server-safe (sin hooks). Todo lo que muestran trae su "por qué" explícito.

import { TrendingDown, ShoppingBasket, Package } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CHURN_LABEL, type ChurnResult, type ChurnStatus } from "@/lib/churn";
import type { Recommendation } from "@/lib/cross-sell";

const CHURN_VARIANT: Record<ChurnStatus, "success" | "warning" | "danger" | "muted"> = {
  sano: "success",
  en_riesgo: "warning",
  cayo: "danger",
  sin_facturacion: "danger",
  sin_historial: "muted",
};

export function ChurnCard({ churn, trend }: { churn: ChurnResult; trend?: { period: string; amount: number }[] }) {
  const money = (n: number) =>
    new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(n);
  // Parsea "YYYY-MM-DD" como fecha local (no UTC) para que el mes no se corra
  // uno hacia atrás en zonas con offset negativo (p.ej. Mazatlán UTC-7).
  const monthShort = (p: string) => {
    const [y, m] = p.split("-").map(Number);
    return new Date(y, (m || 1) - 1, 1).toLocaleDateString("es-MX", { month: "short" });
  };

  return (
    <Card>
      <CardContent className="space-y-2 p-5">
        <div className="flex items-center gap-2">
          <TrendingDown className="h-4 w-4 text-muted-foreground" />
          <h3 className="font-display text-lg">Tendencia de compra</h3>
          <Badge variant={CHURN_VARIANT[churn.status]} className="ml-auto">
            {CHURN_LABEL[churn.status]}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">{churn.reason}</p>
        {trend && trend.length > 0 && (
          <div className="flex flex-wrap gap-x-3 gap-y-1 pt-1 text-xs text-muted-foreground">
            {trend.map((t) => (
              <span key={t.period}>
                <span className="uppercase">{monthShort(t.period)}</span>{" "}
                <span className="font-medium text-foreground">{money(t.amount)}</span>
              </span>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function TopProductsCard({
  products,
}: {
  products: { nombre: string; cantidad: number; total: number }[];
}) {
  const money = (n: number) =>
    new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(n);
  const qty = (n: number) => new Intl.NumberFormat("es-MX").format(Math.round(n));

  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <div className="flex items-center gap-2">
          <Package className="h-4 w-4 text-muted-foreground" />
          <h3 className="font-display text-lg">Qué nos compra</h3>
        </div>
        {!products.length ? (
          <p className="text-sm text-muted-foreground">
            Aún no hay ventas por producto registradas para esta cuenta.
          </p>
        ) : (
          <ul className="space-y-2">
            {products.map((p) => (
              <li
                key={p.nombre}
                className="flex items-start justify-between gap-3 border-b pb-2 last:border-0 last:pb-0"
              >
                <div className="min-w-0">
                  <div className="font-medium leading-tight">{p.nombre}</div>
                  <div className="text-xs text-muted-foreground">{money(p.total)} acumulado</div>
                </div>
                <Badge variant="accent" className="shrink-0">
                  {qty(p.cantidad)} pz
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export function CrossSellCard({ recommendations }: { recommendations: Recommendation[] }) {
  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <div className="flex items-center gap-2">
          <ShoppingBasket className="h-4 w-4 text-muted-foreground" />
          <h3 className="font-display text-lg">Venta cruzada sugerida</h3>
        </div>
        {!recommendations.length ? (
          <p className="text-sm text-muted-foreground">
            Aún no hay suficientes patrones de compra de clientes parecidos para sugerir productos.
          </p>
        ) : (
          <ul className="space-y-2">
            {recommendations.map((r) => (
              <li key={r.codigo} className="flex items-start justify-between gap-3 border-b pb-2 last:border-0 last:pb-0">
                <div>
                  <div className="font-medium">{r.nombre}</div>
                  <div className="text-xs text-muted-foreground">{r.reason}</div>
                </div>
                <Badge variant="accent" className="shrink-0">
                  {r.supporters} clientes
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
