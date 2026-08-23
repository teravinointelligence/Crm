import Link from "next/link";
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  Info,
  Sparkles,
  Store,
  Target,
  TrendingUp,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { FelixIncentiveMonth, FelixIncentiveSnapshot } from "@/lib/felix-incentive";
import { formatDateTime } from "@/lib/utils";

function money(value: number): string {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  }).format(value);
}

function monthName(period: string): string {
  return new Intl.DateTimeFormat("es-MX", { month: "long", year: "numeric" }).format(
    new Date(`${period}T12:00:00`),
  );
}

function statusCopy(snapshot: FelixIncentiveSnapshot) {
  if (snapshot.status === "upcoming") {
    return {
      badge: "Próximamente",
      variant: "warning" as const,
      message:
        snapshot.daysUntilStart === 1
          ? "Se activa mañana"
          : `Se activa en ${snapshot.daysUntilStart} días`,
    };
  }
  if (snapshot.status === "ended") {
    return { badge: "Finalizado", variant: "muted" as const, message: "Cierre del programa" };
  }
  return { badge: "Activo", variant: "success" as const, message: monthName(snapshot.currentPeriod) };
}

function Progress({ month }: { month: FelixIncentiveMonth }) {
  const width = Math.min(100, Math.max(0, month.progressHealthy));
  const minimumMarker = (400_000 / 450_000) * 100;
  return (
    <div>
      <div className="mb-2 flex items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Ventas netas del mes
          </p>
          <p className="font-display text-3xl text-brand-tinta">{money(month.netSales)}</p>
        </div>
        <p className="text-right text-xs text-muted-foreground">
          Meta saludable<br />
          <span className="font-semibold text-foreground">$450,000</span>
        </p>
      </div>
      <div className="relative h-3 overflow-hidden rounded-full bg-brand-marfil">
        <div
          className="h-full rounded-full bg-gradient-to-r from-brand-carmesi to-brand-oro transition-[width] duration-500"
          style={{ width: `${width}%` }}
        />
        <span
          className="absolute inset-y-0 w-0.5 bg-brand-tinta/60"
          style={{ left: `${minimumMarker}%` }}
          aria-hidden="true"
        />
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] text-muted-foreground">
        <span>$0</span>
        <span className="font-medium text-brand-carmesi">Mínima $400 mil</span>
        <span>$450 mil</span>
      </div>
    </div>
  );
}

function SummaryTiles({ month }: { month: FelixIncentiveMonth }) {
  const tiles = [
    {
      label: "Comisión ordinaria 3%",
      value: money(month.ordinaryCommission),
      icon: CircleDollarSign,
    },
    { label: "Acelerador adicional", value: money(month.accelerator), icon: TrendingUp },
    { label: "Bono por aperturas", value: money(month.openingBonus), icon: Store },
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {tiles.map((tile) => (
        <div key={tile.label} className="rounded-xl border bg-white/80 p-3">
          <tile.icon className="mb-2 h-4 w-4 text-brand-carmesi" />
          <p className="text-xs text-muted-foreground">{tile.label}</p>
          <p className="font-display text-xl">{tile.value}</p>
        </div>
      ))}
    </div>
  );
}

export function FelixIncentiveMeter({
  snapshot,
  variant = "compact",
}: {
  snapshot: FelixIncentiveSnapshot;
  variant?: "compact" | "full";
}) {
  const status = statusCopy(snapshot);
  const current = snapshot.current;
  const minimumReached = current.netSales >= 400_000;

  return (
    <Card className="overflow-hidden border-brand-oro/50 bg-gradient-to-br from-brand-crema to-white">
      <CardHeader className="border-b border-brand-oro/30 bg-gradient-to-r from-brand-carmesi/[0.08] to-brand-oro/[0.12] pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-brand-carmesi p-2.5 text-white shadow-sm">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <CardTitle>Mi incentivo Vallarta</CardTitle>
                <Badge variant={status.variant}>{status.badge}</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {status.message} · Vigencia septiembre 2026–agosto 2027
              </p>
            </div>
          </div>
          {variant === "compact" && (
            <Button asChild variant="outline" size="sm">
              <Link href="/incentivos">
                Ver detalle <ArrowRight className="ml-1.5 h-4 w-4" />
              </Link>
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-5 pt-5">
        {snapshot.status === "upcoming" ? (
          <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
            <CalendarClock className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <p className="font-semibold">Tu medidor comienza el 1 de septiembre</p>
              <p className="mt-1 text-sm text-amber-800">
                Desde ese día verás aquí tus ventas netas importadas, tu avance y el
                incentivo adicional estimado del mes.
              </p>
            </div>
          </div>
        ) : (
          <Progress month={current} />
        )}

        <SummaryTiles month={current} />

        {snapshot.status !== "upcoming" && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-brand-tinta px-4 py-3 text-white">
            <div>
              <p className="text-xs text-white/65">Variable estimado del mes</p>
              <p className="font-display text-2xl">{money(current.totalVariable)}</p>
            </div>
            <div className="text-right text-xs text-white/75">
              {minimumReached ? (
                <span className="inline-flex items-center gap-1 text-emerald-300">
                  <CheckCircle2 className="h-4 w-4" /> Meta mínima alcanzada
                </span>
              ) : (
                <span>Faltan {money(current.amountToMinimum)} para la meta mínima</span>
              )}
            </div>
          </div>
        )}

        {snapshot.dataWarning && (
          <p className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
            <Info className="mt-0.5 h-4 w-4 shrink-0" /> {snapshot.dataWarning}
          </p>
        )}

        {variant === "full" && <FullDetail snapshot={snapshot} />}
      </CardContent>
    </Card>
  );
}

function FullDetail({ snapshot }: { snapshot: FelixIncentiveSnapshot }) {
  const current = snapshot.current;
  return (
    <div className="space-y-6 border-t border-brand-oro/30 pt-6">
      <section>
        <h3 className="mb-3 flex items-center gap-2 font-display text-lg">
          <Target className="h-5 w-5 text-brand-carmesi" /> Cómo se calcula
        </h3>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-xl border bg-white p-4">
            <p className="font-semibold">Acelerador progresivo mensual</p>
            <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
              <li>1% sobre el tramo de $350,000 a $400,000</li>
              <li>2% sobre el tramo de $400,000 a $500,000</li>
              <li>3% sobre lo que supere $500,000</li>
            </ul>
          </div>
          <div className="rounded-xl border bg-white p-4">
            <p className="font-semibold">Nuevas aperturas</p>
            <p className="mt-2 text-sm text-muted-foreground">
              $1,000 por primera compra pagada de al menos $10,000 y $1,000 por
              recompra pagada dentro de 45 días. Máximo dos cuentas y $4,000 al mes;
              se libera al llegar a $400,000 de ventas netas.
            </p>
          </div>
        </div>
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <h3 className="font-display text-lg">Aperturas de {monthName(current.period)}</h3>
          <p className="text-xs text-muted-foreground">
            {current.openingMilestones}/4 hitos · Potencial {money(current.openingBonusPotential)}
          </p>
        </div>
        {current.openings.length ? (
          <div className="space-y-2">
            {current.openings.map((opening) => (
              <div
                key={opening.accountId}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-white p-3 text-sm"
              >
                <div>
                  <p className="font-medium">{opening.accountName}</p>
                  <p className="text-xs text-muted-foreground">
                    Primera compra: {opening.firstPurchaseDate}
                  </p>
                </div>
                <Badge variant={opening.repeatPurchaseDate ? "success" : "warning"}>
                  {opening.repeatPurchaseDate ? "Recompra lograda" : "Recompra pendiente"}
                </Badge>
              </div>
            ))}
          </div>
        ) : (
          <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            Aún no hay aperturas calificadas en este mes.
          </p>
        )}
      </section>

      {snapshot.months.length > 1 && (
        <section>
          <h3 className="mb-3 font-display text-lg">Historial mensual</h3>
          <div className="overflow-x-auto rounded-xl border bg-white">
            <table className="w-full min-w-[620px] text-sm">
              <thead className="bg-muted/60 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Mes</th>
                  <th className="px-4 py-3 text-right font-medium">Ventas netas</th>
                  <th className="px-4 py-3 text-right font-medium">Acelerador</th>
                  <th className="px-4 py-3 text-right font-medium">Aperturas</th>
                  <th className="px-4 py-3 text-right font-medium">Variable total</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {[...snapshot.months].reverse().map((month) => (
                  <tr key={month.period}>
                    <td className="px-4 py-3 capitalize">{monthName(month.period)}</td>
                    <td className="px-4 py-3 text-right">{money(month.netSales)}</td>
                    <td className="px-4 py-3 text-right">{money(month.accelerator)}</td>
                    <td className="px-4 py-3 text-right">{money(month.openingBonus)}</td>
                    <td className="px-4 py-3 text-right font-semibold">{money(month.totalVariable)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        Cálculo estimado con ventas netas y facturas importadas al CRM. El pago final
        está sujeto al cierre y validación mensual de TERAVINO.
        {current.lastUpdatedAt ? ` Datos actualizados: ${formatDateTime(current.lastUpdatedAt)}.` : ""}
      </p>
    </div>
  );
}
