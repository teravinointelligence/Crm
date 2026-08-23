import Link from "next/link";
import {
  ArrowRight,
  Banknote,
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  Info,
  LockKeyhole,
  Sparkles,
  Store,
  Target,
  TrendingUp,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type {
  PersonalAccountMilestone,
  PersonalIncentiveMonth,
  PersonalIncentiveSnapshot,
} from "@/lib/personal-incentives";
import { salesTargetStatusLabel } from "@/lib/sales-targets";

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

function statusCopy(snapshot: PersonalIncentiveSnapshot) {
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
    return { badge: "Finalizado", variant: "muted" as const, message: "Piloto finalizado" };
  }
  return { badge: "Activo", variant: "success" as const, message: monthName(snapshot.currentPeriod) };
}

function ProgressBar({
  value,
  label,
}: {
  value: number;
  label: string;
}) {
  const width = Math.min(100, Math.max(0, value));
  return (
    <div
      className="h-3 overflow-hidden rounded-full bg-brand-marfil"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(width)}
    >
      <div
        className="h-full rounded-full bg-gradient-to-r from-brand-carmesi to-brand-oro transition-[width] duration-500"
        style={{ width: `${width}%` }}
      />
    </div>
  );
}

function SalesSection({ month }: { month: PersonalIncentiveMonth }) {
  if (!month.salesTarget) return null;
  const amountLeft = Math.max(0, month.salesTarget - month.netSales);
  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Ventas netas del mes
          </p>
          <p className="font-display text-3xl text-brand-tinta">{money(month.netSales)}</p>
        </div>
        <div className="text-right text-xs text-muted-foreground">
          {salesTargetStatusLabel(month.salesTargetStatus)}<br />
          <span className="font-semibold text-foreground">{money(month.salesTarget)}</span>
        </div>
      </div>
      <ProgressBar value={month.salesProgress} label="Avance de ventas" />
      <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
        <span>{Math.round(month.salesProgress)}% alcanzado</span>
        <span>
          {amountLeft > 0 ? `Faltan ${money(amountLeft)}` : "Meta alcanzada"}
        </span>
      </div>
      <div className="flex items-center justify-between rounded-xl border bg-white p-3">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-brand-carmesi" />
          <span className="text-sm">Bono por ventas</span>
        </div>
        <div className="text-right">
          <p className="font-display text-xl">{money(month.salesBonus)}</p>
          <p className="text-[11px] text-muted-foreground">
            {month.salesBonusRate ? `${month.salesBonusRate * 100}% adicional` : "Se activa al 100%"}
          </p>
        </div>
      </div>
    </section>
  );
}

function milestoneState(rows: PersonalAccountMilestone[]) {
  const paid = rows.filter((row) => row.paid).length;
  const pending = rows.length - paid;
  return { paid, pending };
}

function ActionSection({ month }: { month: PersonalIncentiveMonth }) {
  const openings = milestoneState(month.openings);
  const reactivations = milestoneState(month.reactivations);
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Activación de cuentas
          </p>
          <p className="font-display text-2xl">Hasta $3,000</p>
        </div>
        <Badge variant={month.actionBonus >= 3_000 ? "success" : "warning"}>
          {money(month.actionBonus)} desbloqueados
        </Badge>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <ActionTile
          title="Nueva apertura"
          amount={month.openingBonus}
          paid={openings.paid}
          pending={openings.pending}
        />
        <ActionTile
          title="Cuenta reactivada"
          amount={month.reactivationBonus}
          paid={reactivations.paid}
          pending={reactivations.pending}
        />
      </div>
      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <LockKeyhole className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        $1,500 por cada categoría. La compra mínima es de $10,000 y debe estar
        completamente pagada; una factura pendiente todavía no libera el bono.
      </p>
    </section>
  );
}

function ActionTile({
  title,
  amount,
  paid,
  pending,
}: {
  title: string;
  amount: number;
  paid: number;
  pending: number;
}) {
  return (
    <div className="rounded-xl border bg-white p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <Store className="h-4 w-4 text-brand-carmesi" />
        <Badge variant={amount ? "success" : pending ? "warning" : "muted"}>
          {amount ? "Desbloqueado" : pending ? "Pendiente de pago" : "Por lograr"}
        </Badge>
      </div>
      <p className="text-sm font-medium">{title}</p>
      <p className="font-display text-xl">{money(amount)}</p>
      <p className="text-[11px] text-muted-foreground">
        {paid} pagada{paid === 1 ? "" : "s"} · {pending} pendiente{pending === 1 ? "" : "s"}
      </p>
    </div>
  );
}

function CollectionSection({ month }: { month: PersonalIncentiveMonth }) {
  const amountLeft = Math.max(0, month.collectionGoal - month.collectedOverdue);
  return (
    <section className="space-y-3 rounded-xl border border-amber-200 bg-amber-50/70 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-amber-900">
            <Banknote className="h-4 w-4" /> Mi reto de cobranza
          </p>
          <p className="mt-1 font-display text-2xl text-brand-tinta">
            {money(month.collectedOverdue)} recuperados
          </p>
        </div>
        <div className="text-right text-xs text-amber-900/70">
          Meta del mes<br />
          <span className="font-semibold text-amber-950">{money(month.collectionGoal)}</span>
        </div>
      </div>
      <ProgressBar value={month.collectionProgress} label="Avance de cobranza" />
      <div className="flex flex-wrap justify-between gap-2 text-xs text-amber-900/75">
        <span>{Math.round(month.collectionProgress)}% recuperado</span>
        <span>{amountLeft > 0 ? `Faltan ${money(amountLeft)}` : "Meta alcanzada"}</span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg bg-white p-3">
          <p className="text-xs text-muted-foreground">Bono por avance</p>
          <p className="font-display text-xl">{money(month.collectionTierBonus)}</p>
        </div>
        <div className="rounded-lg bg-white p-3">
          <p className="text-xs text-muted-foreground">Suspendidas liberadas</p>
          <p className="font-display text-xl">
            {month.releasedAccounts} · {money(month.collectionReleaseBonus)}
          </p>
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 rounded-lg bg-brand-tinta px-3 py-2 text-white">
        <span className="text-sm">Incentivo de cobranza</span>
        <span className="font-display text-xl">{money(month.collectionBonus)}</span>
      </div>
      <p className="text-xs text-amber-900/75">
        Solo cuentan pagos confirmados y aplicados a facturas que ya estaban vencidas al
        iniciar el mes. Los abonos suman al avance; el bono por liberar crédito exige liquidar
        completamente el vencido de la cuenta.
      </p>
    </section>
  );
}

export function PersonalIncentiveMeter({
  snapshot,
  variant = "compact",
}: {
  snapshot: PersonalIncentiveSnapshot;
  variant?: "compact" | "full";
}) {
  const status = statusCopy(snapshot);
  const current = snapshot.current;
  const showsActions = snapshot.config.actionChallenge;

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
                <CardTitle>Mi incentivo personalizado</CardTitle>
                <Badge variant={status.variant}>{status.badge}</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {snapshot.config.recognition} · {status.message}
              </p>
            </div>
          </div>
          {variant === "compact" ? (
            <Button asChild variant="outline" size="sm">
              <Link href="/incentivos">
                Ver detalle <ArrowRight className="ml-1.5 h-4 w-4" />
              </Link>
            </Button>
          ) : null}
        </div>
      </CardHeader>

      <CardContent className="space-y-6 pt-5">
        {snapshot.status === "upcoming" ? (
          <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
            <CalendarClock className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <p className="font-semibold">Tu medidor comienza el 1 de septiembre</p>
              <p className="mt-1 text-sm text-amber-800">
                Desde ese día verás aquí tus ventas, cuentas pagadas, cobranza y bonos
                desbloqueados.
              </p>
            </div>
          </div>
        ) : null}

        <SalesSection month={current} />
        {showsActions ? <ActionSection month={current} /> : null}
        <CollectionSection month={current} />

        {snapshot.status !== "upcoming" ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-brand-tinta px-4 py-3 text-white">
            <div>
              <p className="text-xs text-white/65">Incentivo adicional estimado</p>
              <p className="font-display text-2xl">{money(current.totalAdditional)}</p>
            </div>
            <span className="inline-flex items-center gap-1 text-xs text-emerald-300">
              <CheckCircle2 className="h-4 w-4" /> Solo logros validados
            </span>
          </div>
        ) : null}

        {snapshot.dataWarning ? (
          <p className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
            <Info className="mt-0.5 h-4 w-4 shrink-0" /> {snapshot.dataWarning}
          </p>
        ) : null}

        {variant === "full" ? <FullDetail snapshot={snapshot} /> : null}
      </CardContent>
    </Card>
  );
}

function FullDetail({ snapshot }: { snapshot: PersonalIncentiveSnapshot }) {
  return (
    <div className="space-y-6 border-t border-brand-oro/30 pt-6">
      <section>
        <h3 className="mb-3 flex items-center gap-2 font-display text-lg">
          <Target className="h-5 w-5 text-brand-carmesi" /> Reglas del piloto
        </h3>
        <div className="grid gap-3 md:grid-cols-3">
          {snapshot.config.actionChallenge ? (
            <div className="rounded-xl border bg-white p-4">
              <Store className="mb-2 h-5 w-5 text-brand-carmesi" />
              <p className="font-semibold">Apertura y reactivación</p>
              <p className="mt-1 text-sm text-muted-foreground">
                $1,500 por cada categoría, con compra mínima de $10,000 completamente pagada.
              </p>
            </div>
          ) : null}
          <div className="rounded-xl border bg-white p-4">
            <Banknote className="mb-2 h-5 w-5 text-brand-carmesi" />
            <p className="font-semibold">Cobranza</p>
            <p className="mt-1 text-sm text-muted-foreground">
              $1,000 al 50%, $1,500 al 75% y $2,000 al 100%; más $1,000 por liberar
              una suspendida. Tope $3,000.
            </p>
          </div>
          {snapshot.config.actionChallenge ? (
            <div className="rounded-xl border bg-white p-4">
              <CircleDollarSign className="mb-2 h-5 w-5 text-brand-carmesi" />
              <p className="font-semibold">Meta de ventas</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Se calcula por temporada, historial y un reto mínimo de 15%. Al iniciar el mes
                queda bloqueada. El bono paga 0.5% al 100%, 0.75% al 110% y 1% al 120%.
              </p>
            </div>
          ) : null}
        </div>
      </section>

      <section>
        <h3 className="mb-3 font-display text-lg">Historial mensual</h3>
        <div className="overflow-x-auto rounded-xl border bg-white">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Mes</th>
                <th className="px-4 py-3 text-right">Ventas</th>
                <th className="px-4 py-3 text-right">Cuentas pagadas</th>
                <th className="px-4 py-3 text-right">Cobrado vencido</th>
                <th className="px-4 py-3 text-right">Incentivo</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {snapshot.months.map((month) => (
                <tr key={month.period}>
                  <td className="px-4 py-3 capitalize">{monthName(month.period)}</td>
                  <td className="px-4 py-3 text-right">
                    {month.salesTarget ? `${money(month.netSales)} / ${money(month.salesTarget)}` : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {month.openings.filter((row) => row.paid).length +
                      month.reactivations.filter((row) => row.paid).length}
                  </td>
                  <td className="px-4 py-3 text-right">{money(month.collectedOverdue)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-brand-carmesi">
                    {money(month.totalAdditional)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
