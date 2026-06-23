"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Award, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn, formatCurrency } from "@/lib/utils";

const MESES_LABEL: Record<string, string> = {
  "01": "Ene", "02": "Feb", "03": "Mar", "04": "Abr",
  "05": "May", "06": "Jun", "07": "Jul", "08": "Ago",
  "09": "Sep", "10": "Oct", "11": "Nov", "12": "Dic",
};

function mesLabel(m: string) {
  const [y, mm] = m.split("-");
  return `${MESES_LABEL[mm] ?? mm} ${y}`;
}

function mesShort(m: string) {
  return MESES_LABEL[m.split("-")[1]] ?? m;
}

function mesOptions() {
  const opts: { value: string; label: string }[] = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    opts.push({ value: val, label: mesLabel(val) });
  }
  return opts;
}

function eficienciaBadge(e: number | null): "success" | "warning" | "danger" | "muted" {
  if (e === null) return "muted";
  if (e >= 50) return "success";
  if (e >= 20) return "warning";
  return "danger";
}

function eficienciaColor(e: number | null) {
  if (e === null) return "text-muted-foreground";
  if (e >= 50) return "text-emerald-600";
  if (e >= 20) return "text-amber-600";
  return "text-red-500";
}

function GaugeBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
      <div
        className={cn(
          "h-full rounded-full transition-all duration-500",
          pct >= 50 ? "bg-emerald-500" : pct >= 20 ? "bg-amber-400" : "bg-red-400",
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

type HistMes = { mes: string; cobrado: number };
type RepStat = {
  rep_id: string;
  rep_name: string;
  vencido: number;
  pendiente: number;
  cobrado: number;
  eficiencia: number | null;
  hist: HistMes[];
};

export function EficienciaCobroClient({
  isAdmin,
  initialMes,
}: {
  isAdmin: boolean;
  initialMes: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [mes, setMes] = useState(initialMes);
  const [stats, setStats] = useState<RepStat[]>([]);
  const [mesesHist, setMesesHist] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  function navigate(m: string) {
    router.replace(`${pathname}?mes=${m}`);
  }

  useEffect(() => {
    setLoading(true);
    fetch(`/api/ventas/cobro?mes=${mes}`)
      .then((r) => r.json())
      .then((d) => {
        setStats(d.stats ?? []);
        setMesesHist(d.mesesHist ?? []);
      })
      .finally(() => setLoading(false));
  }, [mes]);

  const totalVencido = stats.reduce((s, r) => s + r.vencido, 0);
  const totalCobrado = stats.reduce((s, r) => s + r.cobrado, 0);
  const eficienciaGlobal = totalVencido > 0
    ? Math.round((totalCobrado / totalVencido) * 1000) / 10
    : null;
  const maxCobrado = Math.max(...stats.map((r) => r.cobrado), 1);

  return (
    <div className="space-y-6">
      {/* Selector de mes */}
      <div className="flex items-center gap-3">
        <select
          value={mes}
          onChange={(e) => { setMes(e.target.value); navigate(e.target.value); }}
          className="rounded-md border bg-background px-3 py-1.5 text-sm"
        >
          {mesOptions().map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      <p className="text-xs text-muted-foreground">
        Eficiencia = cobrado en el mes ÷ vencido actual de su cartera. El vencido es el snapshot actual (facturas con saldo y fecha de vencimiento pasada).
      </p>

      {loading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">Calculando...</div>
      ) : stats.length === 0 ? (
        <div className="py-12 text-center text-sm text-muted-foreground">
          Sin cartera ni cobros en este período.
        </div>
      ) : (
        <>
          {/* Resumen global */}
          <div className="grid grid-cols-3 gap-3">
            <Card>
              <CardContent className="p-4">
                <p className="text-xs uppercase text-muted-foreground">Vencido total</p>
                <p className="font-display text-2xl text-red-500">{formatCurrency(totalVencido)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs uppercase text-muted-foreground">Cobrado en {mesShort(mes)}</p>
                <p className="font-display text-2xl text-emerald-600">{formatCurrency(totalCobrado)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs uppercase text-muted-foreground">Eficiencia global</p>
                <p className={cn("font-display text-2xl", eficienciaColor(eficienciaGlobal))}>
                  {eficienciaGlobal !== null ? `${eficienciaGlobal}%` : "—"}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Cards por vendedor */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {stats.map((r, i) => (
              <Card key={r.rep_id} className={cn(i === 0 && isAdmin && "border-emerald-300")}>
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {i === 0 && isAdmin && <Award className="h-4 w-4 text-amber-500" />}
                      <p className="font-medium">{r.rep_name.split(" ")[0]}</p>
                    </div>
                    <Badge variant={eficienciaBadge(r.eficiencia)}>
                      {r.eficiencia !== null ? `${r.eficiencia}%` : "Sin vencido"}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">Vencido</p>
                      <p className="font-medium text-red-500">{formatCurrency(r.vencido)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Cobrado</p>
                      <p className="font-medium text-emerald-600">{formatCurrency(r.cobrado)}</p>
                    </div>
                  </div>

                  <GaugeBar value={r.cobrado} max={maxCobrado} />

                  {/* Sparkchart últimos 6 meses */}
                  <div className="pt-1">
                    <p className="mb-1 text-xs text-muted-foreground">Cobros últimos 6 meses</p>
                    <div className="flex items-end gap-1 h-10">
                      {r.hist.map((h, idx) => {
                        const maxH = Math.max(...r.hist.map((x) => x.cobrado), 1);
                        const pct = Math.round((h.cobrado / maxH) * 100);
                        const isCurrent = h.mes === mes;
                        return (
                          <div
                            key={h.mes}
                            className="flex flex-1 flex-col items-center gap-0.5"
                            title={`${mesShort(h.mes)}: ${formatCurrency(h.cobrado)}`}
                          >
                            <div className="flex w-full flex-1 items-end">
                              <div
                                className={cn(
                                  "w-full rounded-sm transition-all",
                                  isCurrent ? "bg-brand-carmesi" : "bg-muted-foreground/30",
                                )}
                                style={{ height: `${Math.max(4, pct)}%` }}
                              />
                            </div>
                            <span className={cn(
                              "text-[9px]",
                              isCurrent ? "text-brand-carmesi font-semibold" : "text-muted-foreground",
                            )}>
                              {mesShort(h.mes)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
