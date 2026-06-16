"use client";

import { useEffect, useState } from "react";
import { TrendingUp, TrendingDown, Minus, Wine, Beer } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { ComisionResult, ProfileKey } from "@/lib/comisiones";

type RepComision = {
  repId: string;
  repName: string;
  profileKey: ProfileKey | null;
  current: ComisionResult;
  prior: ComisionResult | null;
};

type ApiData = {
  period: string | null;
  priorPeriod: string | null;
  mine: {
    profileKey: ProfileKey;
    current: ComisionResult;
    prior: ComisionResult | null;
  } | null;
  team: RepComision[] | null;
};

function periodLabel(period: string | null): string {
  if (!period) return "";
  const meses = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
  const [, m] = period.split("-").map(Number);
  return meses[m - 1] ?? period;
}

function pct(current: number, prior: number): number | null {
  if (!prior) return null;
  return Math.round(((current - prior) / prior) * 100);
}

function fmt(n: number): string {
  return n.toLocaleString("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function Trend({ current, prior }: { current: number; prior: number | null }) {
  if (prior === null) return null;
  const change = pct(current, prior);
  if (change === null) return null;
  if (change > 0)
    return (
      <span className="inline-flex items-center gap-0.5 text-emerald-600 text-xs font-medium">
        <TrendingUp className="h-3 w-3" />+{change}% vs mes anterior
      </span>
    );
  if (change < 0)
    return (
      <span className="inline-flex items-center gap-0.5 text-rose-500 text-xs font-medium">
        <TrendingDown className="h-3 w-3" />{change}% vs mes anterior
      </span>
    );
  return (
    <span className="inline-flex items-center gap-0.5 text-muted-foreground text-xs">
      <Minus className="h-3 w-3" />Sin cambio
    </span>
  );
}

function MiniRepRow({ rep, period }: { rep: RepComision; period: string | null }) {
  const { current, prior, repName, profileKey } = rep;
  const firstName = repName.split(" ")[0];
  const change = prior ? pct(current.comTotal, prior.comTotal) : null;
  return (
    <div className="flex items-center justify-between gap-2 py-2 border-b last:border-0">
      <div className="min-w-0">
        <div className="font-medium text-sm truncate">{firstName}</div>
        <div className="text-xs text-muted-foreground">
          {current.lineasContadas} líneas
          {current.lineasExcluidas > 0 && ` · ${current.lineasExcluidas} excl.`}
        </div>
      </div>
      <div className="text-right shrink-0">
        <div className="font-semibold text-sm">{fmt(current.comTotal)}</div>
        {change !== null && (
          <div className={`text-xs ${change > 0 ? "text-emerald-600" : change < 0 ? "text-rose-500" : "text-muted-foreground"}`}>
            {change > 0 ? "+" : ""}{change}%
          </div>
        )}
      </div>
    </div>
  );
}

export function ComisionCard() {
  const [data, setData] = useState<ApiData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/dashboard/comision")
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <Card>
        <CardContent className="py-6 text-center text-sm text-muted-foreground animate-pulse">
          Calculando comisiones…
        </CardContent>
      </Card>
    );
  }

  if (!data || !data.mine) return null;

  const { mine, team, period, priorPeriod } = data;
  const { current, prior } = mine;
  const priorTotal = prior?.comTotal ?? null;

  const progressPct =
    priorTotal && current.comTotal
      ? Math.min(100, Math.round((current.comTotal / priorTotal) * 100))
      : null;

  return (
    <div className="space-y-4">
      <Card className="border-2 border-brand-carmesi/20 bg-gradient-to-br from-brand-carmesi/5 to-transparent">
        <CardContent className="pt-5 pb-4 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                Comisión estimada · {periodLabel(period)}
              </p>
              <p className="font-display text-4xl font-bold mt-0.5 text-brand-carmesi">
                {fmt(current.comTotal)}
              </p>
            </div>
            <Badge variant="outline" className="text-xs shrink-0 mt-1">Estimado</Badge>
          </div>

          <Trend current={current.comTotal} prior={priorTotal} />

          {progressPct !== null && (
            <div>
              <div className="mb-1 flex justify-between text-[11px] text-muted-foreground">
                <span>vs {periodLabel(priorPeriod)} ({fmt(priorTotal!)})</span>
                <span>{progressPct}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-brand-carmesi transition-all"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
          )}

          <div className="flex gap-4 pt-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Wine className="h-3.5 w-3.5 text-brand-carmesi/70" />
              <span>Vino:</span>
              <span className="font-medium text-foreground">{fmt(current.comVino)}</span>
            </div>
            {current.comCerveza > 0 && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Beer className="h-3.5 w-3.5 text-amber-600/70" />
                <span>Cerveza:</span>
                <span className="font-medium text-foreground">{fmt(current.comCerveza)}</span>
              </div>
            )}
          </div>

          <p className="text-[10px] text-muted-foreground/70">
            Basado en ventas CONTPAQ · preliminar, no incluye ajustes del cierre
          </p>
        </CardContent>
      </Card>

      {team && team.length > 0 && (
        <Card>
          <CardContent className="pt-4 pb-2">
            <h3 className="text-sm font-medium mb-1">Comisiones del equipo · {periodLabel(period)}</h3>
            <div>
              {team
                .sort((a, b) => b.current.comTotal - a.current.comTotal)
                .map((r) => (
                  <MiniRepRow key={r.repId} rep={r} period={period} />
                ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
