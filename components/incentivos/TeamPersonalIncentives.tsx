import { Banknote, Sparkles, Store, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { PersonalIncentiveSnapshot } from "@/lib/personal-incentives";

function money(value: number): string {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  }).format(value);
}

export function TeamPersonalIncentives({
  snapshots,
}: {
  snapshots: PersonalIncentiveSnapshot[];
}) {
  if (!snapshots.length) return null;
  const totalBonus = snapshots.reduce(
    (total, snapshot) => total + snapshot.current.totalAdditional,
    0,
  );
  const totalCollected = snapshots.reduce(
    (total, snapshot) => total + snapshot.current.collectedOverdue,
    0,
  );

  return (
    <Card className="overflow-hidden border-brand-oro/50">
      <CardHeader className="border-b bg-gradient-to-r from-brand-carmesi/[0.08] to-brand-oro/[0.12]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-brand-carmesi" /> Incentivos personalizados
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Vista de dirección · ventas, cuentas pagadas y recuperación de cartera
            </p>
          </div>
          <div className="flex gap-2">
            <Badge variant="success">Cobrado {money(totalCollected)}</Badge>
            <Badge variant="accent">Bonos {money(totalBonus)}</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Vendedor</th>
                <th className="px-4 py-3 text-right">Ventas / meta</th>
                <th className="px-4 py-3 text-right">Apertura / reactivación</th>
                <th className="px-4 py-3 text-right">Cobranza / meta</th>
                <th className="px-4 py-3 text-right">Suspendidas liberadas</th>
                <th className="px-4 py-3 text-right">Incentivo estimado</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {snapshots.map((snapshot) => {
                const month = snapshot.current;
                const paidAccounts =
                  month.openings.filter((row) => row.paid).length +
                  month.reactivations.filter((row) => row.paid).length;
                return (
                  <tr key={snapshot.repId}>
                    <td className="px-4 py-3">
                      <p className="font-medium">{snapshot.repName}</p>
                      <p className="text-xs text-muted-foreground">{snapshot.config.recognition}</p>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {month.salesTarget ? (
                        <>
                          <p>{money(month.netSales)} / {money(month.salesTarget)}</p>
                          <p className="text-xs text-muted-foreground">
                            <TrendingUp className="mr-1 inline h-3 w-3" />
                            {Math.round(month.salesProgress)}%
                          </p>
                        </>
                      ) : (
                        <span className="text-xs text-muted-foreground">Esquema Vallarta separado</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {snapshot.config.actionChallenge ? (
                        <>
                          <p>{paidAccounts} pagadas</p>
                          <p className="text-xs text-muted-foreground">
                            <Store className="mr-1 inline h-3 w-3" />{money(month.actionBonus)}
                          </p>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <p>{money(month.collectedOverdue)} / {money(month.collectionGoal)}</p>
                      <p className="text-xs text-muted-foreground">
                        <Banknote className="mr-1 inline h-3 w-3" />
                        {Math.round(month.collectionProgress)}%
                      </p>
                    </td>
                    <td className="px-4 py-3 text-right">{month.releasedAccounts}</td>
                    <td className="px-4 py-3 text-right font-display text-lg text-brand-carmesi">
                      {money(month.totalAdditional)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
