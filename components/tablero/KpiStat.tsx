// Tarjeta de KPI del Tablero: valor actual, meta, variación vs periodo
// anterior (flecha ↑/↓ con color) y semáforo verde/ámbar/rojo según la meta
// de config/kpi-targets.ts. Server component — sin estado.

import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { semaforoKpi, type KpiTarget, type SemaforoColor } from "@/config/kpi-targets";

const DOT: Record<SemaforoColor, string> = {
  verde: "bg-emerald-500",
  ambar: "bg-amber-500",
  rojo: "bg-red-500",
};

export function KpiStat({
  label,
  value,
  rawValue,
  target,
  metaLabel,
  delta,
  deltaLabel = "vs periodo anterior",
  /** Para KPIs donde bajar es bueno (vencido, DSO) la flecha ↓ pinta verde. */
  lowerIsBetter = false,
  subtitle,
  frecuencia,
}: {
  label: string;
  value: string;
  /** Valor numérico para evaluar el semáforo (si hay meta). */
  rawValue?: number | null;
  target?: KpiTarget;
  /** Meta formateada para mostrar (ej. "$3,000,000" o "≤15%"). */
  metaLabel?: string;
  /** Variación % vs periodo anterior; null = sin comparativo. */
  delta?: number | null;
  deltaLabel?: string;
  lowerIsBetter?: boolean;
  subtitle?: string;
  frecuencia?: "semanal" | "mensual";
}) {
  const semaforo: SemaforoColor | null =
    target && rawValue != null ? semaforoKpi(rawValue, target) : null;

  let deltaNode: React.ReactNode = null;
  if (delta != null && Number.isFinite(delta)) {
    const up = delta > 0.05;
    const down = delta < -0.05;
    const good = up ? !lowerIsBetter : down ? lowerIsBetter : true;
    const Icon = up ? ArrowUpRight : down ? ArrowDownRight : Minus;
    deltaNode = (
      <span
        className={`inline-flex items-center gap-0.5 text-xs font-medium ${
          up || down ? (good ? "text-emerald-700" : "text-red-600") : "text-muted-foreground"
        }`}
      >
        <Icon className="h-3.5 w-3.5" />
        {`${delta > 0 ? "+" : ""}${delta.toFixed(1)}%`}
        <span className="font-normal text-muted-foreground"> {deltaLabel}</span>
      </span>
    );
  }

  return (
    <Card>
      <CardContent className="space-y-1 p-4">
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
          <span className="flex items-center gap-1.5">
            {frecuencia && (
              <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
                {frecuencia}
              </span>
            )}
            {semaforo && <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${DOT[semaforo]}`} title={`Semáforo: ${semaforo}`} />}
          </span>
        </div>
        <p className="font-display text-2xl text-brand-carmesi">{value}</p>
        {deltaNode}
        {(metaLabel || subtitle) && (
          <p className="text-xs text-muted-foreground">
            {metaLabel ? `Meta: ${metaLabel}` : ""}
            {metaLabel && subtitle ? " · " : ""}
            {subtitle ?? ""}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
