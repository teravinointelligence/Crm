import { BarChart3, CalendarClock, LockKeyhole, Pencil, Sparkles, Target } from "lucide-react";
import { overrideSalesTarget } from "@/app/(app)/incentivos/actions";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type {
  PersonalIncentiveSnapshot,
  PersonalSalesHistoryMonth,
} from "@/lib/personal-incentives";
import { salesTargetStatusLabel } from "@/lib/sales-targets";

const MONTHS = [
  "Ene",
  "Feb",
  "Mar",
  "Abr",
  "May",
  "Jun",
  "Jul",
  "Ago",
  "Sep",
  "Oct",
  "Nov",
  "Dic",
];

function monthName(period: string): string {
  return MONTHS[Number(period.slice(5, 7)) - 1] ?? period.slice(0, 7);
}

function money(value: number): string {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  }).format(value);
}

function compactMoney(value: number): string {
  if (Math.abs(value) >= 1_000_000) {
    return `$${(value / 1_000_000).toLocaleString("es-MX", {
      maximumFractionDigits: 1,
    })} M`;
  }
  return `$${Math.round(value / 1_000).toLocaleString("es-MX")} mil`;
}

function recentClosedAverage(history: PersonalSalesHistoryMonth[]): number {
  const closed = history.filter((month) => month.status === "closed").slice(-3);
  if (!closed.length) return 0;
  return closed.reduce((total, month) => total + month.netSales, 0) / closed.length;
}

function targetComparison(target: number, average: number): string {
  if (!average) return "Sin historial suficiente";
  const change = Math.round(((target - average) / average) * 100);
  if (Math.abs(change) <= 1) return "Similar al promedio reciente";
  return change > 0
    ? `Exige ${change}% más que el promedio reciente`
    : `${Math.abs(change)}% debajo del promedio reciente`;
}

function basisLabel(month: PersonalSalesHistoryMonth): string {
  if (month.selectedBasis === "floor") return "mínimo aprobado";
  if (month.selectedBasis === "recent_average") return "promedio reciente +15%";
  if (month.selectedBasis === "seasonality") return "temporada y desempeño +15%";
  if (month.selectedBasis === "direction_override") return "ajuste de Dirección";
  return "regla dinámica";
}

function SalesCell({
  month,
  canEdit,
}: {
  month: PersonalSalesHistoryMonth;
  canEdit: boolean;
}) {
  const futureWithoutSales = month.status === "upcoming" && month.netSales === 0;
  const reached = month.target !== null && month.netSales >= month.target;
  const missed =
    month.status === "closed" && month.target !== null && month.netSales < month.target;

  return (
    <td className="px-1.5 py-2 align-top">
      <div
        className={cn(
          "min-h-[88px] min-w-[112px] rounded-xl border bg-white p-2.5",
          month.status === "current" && "border-brand-oro bg-brand-oro/[0.08]",
          reached && "border-emerald-300 bg-emerald-50",
          missed && "border-red-200 bg-red-50",
          month.status === "upcoming" && month.target && "border-brand-carmesi/20 bg-brand-marfil/40",
        )}
        title={
          month.target
            ? `${salesTargetStatusLabel(month.targetStatus)} · ${basisLabel(month)}`
            : `Ventas: ${money(month.netSales)}`
        }
      >
        <p className="font-semibold text-brand-tinta">
          {futureWithoutSales ? "—" : compactMoney(month.netSales)}
        </p>
        {month.target !== null ? (
          <>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Meta {compactMoney(month.target)}
            </p>
            <p className="mt-0.5 text-[10px] text-muted-foreground">Por {basisLabel(month)}</p>
          </>
        ) : (
          <p className="mt-1 text-[11px] text-muted-foreground">Venta neta</p>
        )}
        <div className="mt-2">
          {month.targetStatus === "overridden" ? (
            <Badge variant="accent">Ajustada</Badge>
          ) : month.targetStatus === "locked" ? (
            <Badge variant="warning"><LockKeyhole className="mr-1 h-3 w-3" /> Meta bloqueada</Badge>
          ) : month.status === "upcoming" ? (
            month.target !== null ? <Badge variant="muted"><Sparkles className="mr-1 h-3 w-3" /> Proyección</Badge> : null
          ) : month.status === "current" ? (
            <Badge variant="warning">En curso</Badge>
          ) : month.target !== null ? (
            <Badge variant={reached ? "success" : "danger"}>
              {Math.round(month.progress ?? 0)}% de meta
            </Badge>
          ) : (
            <Badge variant="outline">Cerrado</Badge>
          )}
        </div>
        {month.target !== null && month.recentAverage !== null ? (
          <details className="mt-2 text-[10px] text-muted-foreground">
            <summary className="cursor-pointer select-none">Ver cálculo</summary>
            <div className="mt-1 space-y-0.5 border-l pl-2">
              <p>Mínimo: {compactMoney(month.minimumFloor ?? 0)}</p>
              <p>Promedio 3 cierres: {compactMoney(month.recentAverage)}</p>
              <p>Mismo mes 2025: {compactMoney(month.priorYearSales ?? 0)}</p>
              <p>Factor desempeño: {(month.ytdFactor ?? 1).toLocaleString("es-MX", { maximumFractionDigits: 2 })}×</p>
            </div>
          </details>
        ) : null}
        {canEdit && month.targetId && month.status !== "closed" ? (
          <details className="mt-2 text-[10px]">
            <summary className="flex cursor-pointer list-none items-center gap-1 text-brand-carmesi">
              <Pencil className="h-3 w-3" /> Ajustar
            </summary>
            <form action={overrideSalesTarget} className="mt-2 space-y-1.5">
              <input type="hidden" name="targetId" value={month.targetId} />
              <input
                name="targetAmount"
                type="number"
                min="25000"
                step="25000"
                defaultValue={month.target ?? undefined}
                aria-label="Nueva meta"
                className="w-full rounded border px-2 py-1 text-xs"
                required
              />
              <input
                name="reason"
                type="text"
                minLength={5}
                placeholder="Motivo del ajuste"
                aria-label="Motivo del ajuste"
                className="w-full rounded border px-2 py-1 text-xs"
                required
              />
              <button className="w-full rounded bg-brand-carmesi px-2 py-1 font-medium text-white">
                Guardar ajuste
              </button>
            </form>
          </details>
        ) : null}
      </div>
    </td>
  );
}

export function TeamSalesGoalHistory({
  snapshots,
  canEdit = false,
}: {
  snapshots: PersonalIncentiveSnapshot[];
  canEdit?: boolean;
}) {
  if (!snapshots.length) return null;
  const periods = snapshots[0].salesHistory.map((month) => month.period);

  return (
    <Card className="overflow-hidden border-brand-oro/40">
      <CardHeader className="border-b bg-gradient-to-r from-brand-oro/[0.1] to-white">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-brand-carmesi" /> Ventas mensuales contra metas
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Historial 2026 · meta = el mayor entre mínimo, promedio de 3 cierres +15% y temporada ajustada +15%
            </p>
          </div>
          <Badge variant="accent">
            <CalendarClock className="mr-1 h-3.5 w-3.5" /> Actualización mensual del reporte de ventas
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="min-w-[1580px] text-sm">
            <thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="sticky left-0 z-10 min-w-[245px] bg-muted px-4 py-3">Vendedor</th>
                <th className="min-w-[150px] px-3 py-3 text-right">Promedio últimos 3 cierres</th>
                {periods.map((period) => (
                  <th key={period} className="min-w-[124px] px-2 py-3 text-center">
                    {monthName(period)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {snapshots.map((snapshot) => {
                const average = recentClosedAverage(snapshot.salesHistory);
                const nextTarget = snapshot.salesHistory.find(
                  (month) => month.target !== null && month.status !== "closed",
                );
                return (
                  <tr key={snapshot.repId}>
                    <td className="sticky left-0 z-10 bg-white px-4 py-3 align-top shadow-[4px_0_8px_-8px_rgba(0,0,0,0.35)]">
                      <p className="font-medium">{snapshot.repName}</p>
                      {nextTarget?.target ? (
                        <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                          <p className="flex items-center gap-1 font-medium text-brand-carmesi">
                            <Target className="h-3.5 w-3.5" /> Próxima meta {compactMoney(nextTarget.target)}
                          </p>
                          <p>{targetComparison(nextTarget.target, average)}</p>
                        </div>
                      ) : null}
                    </td>
                    <td className="px-3 py-4 text-right align-top">
                      <p className="font-semibold">{compactMoney(average)}</p>
                      <p className="mt-1 text-[11px] text-muted-foreground">Meses ya cerrados</p>
                    </td>
                    {snapshot.salesHistory.map((month) => (
                      <SalesCell key={month.period} month={month} canEdit={canEdit} />
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-2 border-t bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
          <span><strong className="text-foreground">Venta neta:</strong> venta registrada después de descuentos.</span>
          <span><strong className="text-foreground">En curso:</strong> puede aumentar con la siguiente importación.</span>
          <span><strong className="text-foreground">Meta:</strong> objetivo mensual del incentivo, independiente de reactivaciones.</span>
          <span><strong className="text-foreground">Bloqueada:</strong> no cambia durante el mes.</span>
          <span><strong className="text-foreground">Proyección:</strong> referencia para un mes futuro.</span>
        </div>
      </CardContent>
    </Card>
  );
}
