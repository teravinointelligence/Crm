"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CalendarPlus, PackageSearch } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type {
  ProductPurchaseRow,
  ProductPurchaseStatus,
  ProductPurchaseTimeline,
} from "@/lib/product-purchase-timeline";

type Filter = "all" | "active" | "stopped";

const STATUS_VARIANT: Record<ProductPurchaseStatus, "success" | "warning" | "danger" | "muted"> = {
  active: "success",
  watch: "warning",
  stopped: "danger",
  occasional: "muted",
};

function monthLabel(period: string, withYear = true): string {
  const [year, month] = period.split("-").map(Number);
  const label = new Date(year, (month || 1) - 1, 1).toLocaleDateString("es-MX", {
    month: "short",
  });
  return withYear ? `${label.replace(".", "")} ${String(year).slice(-2)}` : label.replace(".", "");
}

function money(value: number): string {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  }).format(value);
}

function quantity(value: number): string {
  return new Intl.NumberFormat("es-MX", { maximumFractionDigits: 2 }).format(value);
}

function statusLabel(product: ProductPurchaseRow): string {
  if ((product.status === "watch" || product.status === "stopped") && product.encartado) {
    return "Posible salida de carta/copeo — confirmar";
  }
  if (product.status === "stopped") return "Dejó de comprar";
  if (product.status === "watch") return "Revisar: 1 mes sin compra";
  if (product.status === "active") return "Comprando";
  return "Compra ocasional";
}

export function ProductPurchaseTimelineCard({
  accountId,
  timeline,
}: {
  accountId: string;
  timeline: ProductPurchaseTimeline;
}) {
  const [visibleMonths, setVisibleMonths] = useState<6 | 12>(6);
  const [filter, setFilter] = useState<Filter>("all");

  const alertProducts = useMemo(
    () => timeline.products.filter((product) => product.status === "watch" || product.status === "stopped"),
    [timeline.products],
  );
  const stoppedCount = alertProducts.filter((product) => product.status === "stopped").length;
  const watchCount = alertProducts.filter((product) => product.status === "watch").length;
  const activeCount = timeline.products.filter((product) => product.status === "active").length;
  const visibleProducts = useMemo(() => {
    if (filter === "active") return timeline.products.filter((product) => product.status === "active");
    if (filter === "stopped") {
      return timeline.products.filter((product) => product.status === "watch" || product.status === "stopped");
    }
    return timeline.products;
  }, [filter, timeline.products]);

  const periods = timeline.periods.slice(-visibleMonths);

  return (
    <Card>
      <CardContent className="p-0">
        <div className="space-y-4 border-b p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <PackageSearch className="h-5 w-5 text-brand-carmesi" />
                <h3 className="font-display text-lg">Compra mensual por producto</h3>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {timeline.latestDetailedClosedPeriod
                  ? `Último mes cerrado con detalle: ${monthLabel(timeline.latestDetailedClosedPeriod)}.`
                  : "Aún no hay un mes cerrado con detalle de productos."}
                {" "}Los meses sin desglose y el mes en curso no generan alertas.
              </p>
            </div>
            <div className="flex rounded-md border bg-muted/30 p-1" aria-label="Meses visibles">
              {([6, 12] as const).map((months) => (
                <button
                  key={months}
                  type="button"
                  aria-pressed={visibleMonths === months}
                  onClick={() => setVisibleMonths(months)}
                  className={cn(
                    "rounded px-3 py-1.5 text-xs font-medium transition-colors",
                    visibleMonths === months
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {months} meses
                </button>
              ))}
            </div>
          </div>

          {alertProducts.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span className="font-medium">{alertProducts.length} producto(s) para seguimiento:</span>
              {stoppedCount > 0 && <span>{stoppedCount} dejaron de comprar</span>}
              {stoppedCount > 0 && watchCount > 0 && <span aria-hidden="true">·</span>}
              {watchCount > 0 && <span>{watchCount} por revisar</span>}
            </div>
          )}

          <div className="flex flex-wrap gap-2" aria-label="Filtrar productos">
            {([
              ["all", "Todos", timeline.products.length],
              ["active", "Comprando actualmente", activeCount],
              ["stopped", "Dejaron de comprar", alertProducts.length],
            ] as const).map(([value, label, count]) => (
              <button
                key={value}
                type="button"
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                  filter === value
                    ? "border-brand-carmesi bg-brand-carmesi text-white"
                    : "bg-background text-muted-foreground hover:border-brand-carmesi/50 hover:text-foreground",
                )}
              >
                {label} ({count})
              </button>
            ))}
          </div>
        </div>

        {!timeline.latestDetailedClosedPeriod ? (
          <div className="p-5 text-sm text-muted-foreground">
            Importa el reporte CONTPAQi con productos para habilitar la comparación mensual. El resumen
            “por vendedor” sólo contiene totales y se muestra como “Sin detalle”.
          </div>
        ) : !timeline.products.length ? (
          <div className="p-5 text-sm text-muted-foreground">
            No hay compras por producto registradas para esta cuenta.
          </div>
        ) : !visibleProducts.length ? (
          <div className="p-5 text-sm text-muted-foreground">
            No hay productos en este filtro.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] border-collapse text-sm">
              <thead className="bg-muted/35 text-left text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="sticky left-0 z-10 min-w-[280px] bg-muted px-4 py-3 font-medium">
                    Producto
                  </th>
                  <th scope="col" className="min-w-[190px] px-3 py-3 font-medium">
                    Estado
                  </th>
                  {periods.map((period) => (
                    <th key={period.period} scope="col" className="min-w-[96px] px-3 py-3 text-right font-medium">
                      <span className="uppercase">{monthLabel(period.period)}</span>
                      {period.inProgress && <span className="block normal-case text-brand-carmesi">En curso</span>}
                    </th>
                  ))}
                  <th scope="col" className="min-w-[155px] px-4 py-3 font-medium">
                    Última compra
                  </th>
                </tr>
              </thead>
              <tbody>
                {visibleProducts.map((product) => (
                  <tr key={product.key} className="border-t align-top hover:bg-muted/20">
                    <th scope="row" className="sticky left-0 z-[5] bg-card px-4 py-3 text-left font-normal">
                      <div className="max-w-[300px] font-medium leading-tight">{product.name}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                        {product.code && <span>{product.code}</span>}
                        {product.encartado && <Badge variant="accent">Encartado</Badge>}
                      </div>
                    </th>
                    <td className="px-3 py-3">
                      <Badge variant={STATUS_VARIANT[product.status]} className="max-w-[185px] whitespace-normal leading-tight">
                        {statusLabel(product)}
                      </Badge>
                    </td>
                    {product.months.slice(-visibleMonths).map((month) => (
                      <td key={month.period} className={cn("px-3 py-3 text-right", month.inProgress && "bg-brand-oro/[0.06]")}>
                        {!month.detailAvailable ? (
                          <span className="text-xs text-muted-foreground">Sin detalle</span>
                        ) : month.units > 0 || month.amount > 0 ? (
                          <>
                            <div className="font-medium">{quantity(month.units)} pz</div>
                            <div className="text-xs text-muted-foreground">{money(month.amount)}</div>
                          </>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    ))}
                    <td className="px-4 py-3">
                      <div>{product.lastPurchasePeriod ? monthLabel(product.lastPurchasePeriod) : "—"}</div>
                      {product.monthsSinceLastPurchase != null && product.monthsSinceLastPurchase > 0 && (
                        <div className="text-xs text-muted-foreground">
                          {product.monthsSinceLastPurchase} mes{product.monthsSinceLastPurchase === 1 ? "" : "es"} con detalle sin compra
                        </div>
                      )}
                      {(product.status === "watch" || product.status === "stopped") && (
                        <Link
                          href={`/actividades/nueva?account=${accountId}`}
                          className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-brand-carmesi hover:underline"
                        >
                          <CalendarPlus className="h-3.5 w-3.5" /> Dar seguimiento
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
