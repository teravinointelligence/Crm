import Link from "next/link";
import { ArrowLeft, Banknote, Clock3, LockKeyhole, Target, TrendingUp, Wine } from "lucide-react";
import { requireRep } from "@/lib/auth";
import { loadSampleRoi, type SampleRoiRep } from "@/lib/sample-roi";
import { formatCurrency } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SampleRoiClient } from "@/components/samples/SampleRoiClient";
import { SampleRoiSettingsForm } from "@/components/samples/SampleRoiSettings";

export const metadata = { title: "Retorno de muestras — TERAVINO CRM" };
export const dynamic = "force-dynamic";

const zeroRep = (repId: string, repName: string, limit: number): SampleRoiRep => ({
  repId,
  repName,
  events: 0,
  bottles: 0,
  investment: 0,
  estimatedInvestment: 0,
  opportunities: 0,
  converted: 0,
  sold: 0,
  followed: 0,
  inTheAir: 0,
  conversionPct: 0,
  followUpPct: 0,
  revenue: 0,
  roi: 0,
  currentLimit: limit,
});

export default async function RetornoMuestrasPage() {
  const me = await requireRep();
  const isAdmin = me.role === "admin";
  const canSeeTeam = isAdmin || me.role === "contador";
  const { settings, rows, reps } = await loadSampleRoi();
  const own = reps.find((rep) => rep.repId === me.id) ?? zeroRep(me.id, me.full_name, settings.base_limit);
  const summary = canSeeTeam
    ? reps.reduce(
        (acc, rep) => ({
          ...acc,
          events: acc.events + rep.events,
          bottles: acc.bottles + rep.bottles,
          investment: acc.investment + rep.investment,
          estimatedInvestment: acc.estimatedInvestment + rep.estimatedInvestment,
          opportunities: acc.opportunities + rep.opportunities,
          converted: acc.converted + rep.converted,
          sold: acc.sold + rep.sold,
          followed: acc.followed + rep.followed,
          inTheAir: acc.inTheAir + rep.inTheAir,
          revenue: acc.revenue + rep.revenue,
        }),
        zeroRep("all", "Equipo", settings.base_limit),
      )
    : own;
  summary.conversionPct = summary.opportunities ? (summary.converted / summary.opportunities) * 100 : 0;
  summary.followUpPct = summary.events ? (summary.followed / summary.events) * 100 : 0;
  summary.roi = summary.investment ? summary.revenue / summary.investment : 0;

  const kpis = [
    { label: "Inversión en muestras", value: formatCurrency(summary.investment), detail: `${summary.bottles.toLocaleString("es-MX")} botellas`, icon: Wine },
    { label: "Venta atribuida", value: formatCurrency(summary.revenue), detail: `${summary.sold} oportunidades con venta`, icon: Banknote },
    { label: "Retorno", value: `${summary.roi.toFixed(2)}×`, detail: summary.investment ? `${formatCurrency(summary.revenue)} ÷ ${formatCurrency(summary.investment)}` : "Sin inversión medible", icon: TrendingUp },
    { label: "Conversión", value: `${summary.conversionPct.toFixed(1)}%`, detail: `${summary.converted} de ${summary.opportunities} oportunidades maduras`, icon: Target },
    { label: "Seguimiento", value: `${summary.followUpPct.toFixed(1)}%`, detail: `${summary.inTheAir} muestras en el aire`, icon: Clock3 },
    {
      label: canSeeTeam ? "Límite normal" : "Mi límite por cliente",
      value: `${canSeeTeam ? settings.base_limit : own.currentLimit}`,
      detail: `cada ${settings.client_window_days} días`,
      icon: LockKeyhole,
    },
  ];

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href="/muestras"><ArrowLeft className="mr-1 h-4 w-4" /> Muestras</Link>
      </Button>

      <div>
        <h1 className="font-display text-3xl">Conversión y retorno de muestras</h1>
        <p className="max-w-4xl text-sm text-muted-foreground">
          {canSeeTeam ? "Resultado del equipo" : "Tu resultado"} en los últimos {settings.analysis_days} días.
          El ingreso se atribuye cuando el mismo cliente compra el mismo vino dentro de {settings.conversion_days} días de la muestra.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        {kpis.map((kpi) => (
          <Card key={kpi.label}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="text-xs uppercase text-muted-foreground">{kpi.label}</div>
                <kpi.icon className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="mt-2 text-2xl font-semibold">{kpi.value}</div>
              <div className="mt-1 text-xs text-muted-foreground">{kpi.detail}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {summary.estimatedInvestment > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {formatCurrency(summary.estimatedInvestment)} de la inversión usa el precio base como estimación. Administración puede capturar el costo real en la ficha de cada producto.
        </div>
      )}

      {canSeeTeam && (
        <Card>
          <CardContent className="p-0">
            <div className="border-b px-4 py-3">
              <h2 className="font-display text-xl">Desempeño por vendedor</h2>
              <p className="text-xs text-muted-foreground">El límite baja automáticamente al nivel preventivo o crítico según conversión y ROI.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Vendedor</th>
                    <th className="px-4 py-3 text-right">Botellas</th>
                    <th className="px-4 py-3 text-right">Inversión</th>
                    <th className="px-4 py-3 text-right">Venta</th>
                    <th className="px-4 py-3 text-right">ROI</th>
                    <th className="px-4 py-3 text-right">Conversión</th>
                    <th className="px-4 py-3 text-right">En el aire</th>
                    <th className="px-4 py-3 text-right">Límite</th>
                  </tr>
                </thead>
                <tbody>
                  {reps.map((rep) => (
                    <tr key={rep.repId} className="border-b last:border-0">
                      <td className="px-4 py-3 font-medium">{rep.repName}</td>
                      <td className="px-4 py-3 text-right">{rep.bottles.toLocaleString("es-MX")}</td>
                      <td className="px-4 py-3 text-right">{formatCurrency(rep.investment)}</td>
                      <td className="px-4 py-3 text-right">{formatCurrency(rep.revenue)}</td>
                      <td className="px-4 py-3 text-right font-medium">{rep.roi.toFixed(2)}×</td>
                      <td className="px-4 py-3 text-right">{rep.conversionPct.toFixed(1)}%</td>
                      <td className="px-4 py-3 text-right">{rep.inTheAir}</td>
                      <td className="px-4 py-3 text-right">
                        <Badge variant={rep.currentLimit === settings.low_limit ? "danger" : rep.currentLimit === settings.medium_limit ? "warning" : "success"}>
                          {rep.currentLimit} / {settings.client_window_days} días
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!reps.length && <div className="p-8 text-center text-sm text-muted-foreground">Aún no hay consumo medible por vendedor.</div>}
            </div>
          </CardContent>
        </Card>
      )}

      <SampleRoiClient rows={rows} showRep={canSeeTeam} />
      {isAdmin && <SampleRoiSettingsForm settings={settings} />}
    </div>
  );
}
