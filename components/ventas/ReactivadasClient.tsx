"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { RotateCcw, Award } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn, formatDate } from "@/lib/utils";
import Link from "next/link";

const MESES = [
  "Enero","Febrero","Marzo","Abril","Mayo","Junio",
  "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre",
];

const SILENCIO_OPTS = [
  { label: "≥ 15 días", dias: 15 },
  { label: "≥ 30 días", dias: 30 },
  { label: "≥ 60 días", dias: 60 },
  { label: "≥ 90 días", dias: 90 },
];

type Reactivada = {
  account_id: string;
  account_name: string;
  region: string | null;
  rep_id: string;
  rep_name: string;
  primer_pedido_mes: string;
  ultimo_pedido_anterior: string;
  dias_silencio: number;
};

type RepStat = { rep_id: string; rep_name: string; total: number };

function mesOptions() {
  const opts: { value: string; label: string }[] = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    opts.push({ value: val, label: `${MESES[d.getMonth()]} ${d.getFullYear()}` });
  }
  return opts;
}

export function ReactivadasClient({
  isAdmin,
  reps,
  initialMes,
  initialSilencio,
}: {
  isAdmin: boolean;
  reps: { id: string; full_name: string }[];
  initialMes: string;
  initialSilencio: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [mes, setMes] = useState(initialMes);
  const [silencio, setSilencio] = useState(initialSilencio);
  const [repFilter, setRepFilter] = useState<string | null>(null);
  const [reactivadas, setReactivadas] = useState<Reactivada[]>([]);
  const [porVendedor, setPorVendedor] = useState<RepStat[]>([]);
  const [loading, setLoading] = useState(true);

  function navigate(m: string, s: number) {
    const p = new URLSearchParams({ mes: m, silencio: String(s) });
    router.replace(`${pathname}?${p.toString()}`);
  }

  useEffect(() => {
    setLoading(true);
    fetch(`/api/ventas/reactivadas?mes=${mes}&silencio=${silencio}`)
      .then((r) => r.json())
      .then((d) => {
        setReactivadas(d.reactivadas ?? []);
        setPorVendedor(d.porVendedor ?? []);
      })
      .finally(() => setLoading(false));
  }, [mes, silencio]);

  const displayed = repFilter
    ? reactivadas.filter((r) => r.rep_id === repFilter)
    : reactivadas;

  const meses = mesOptions();

  return (
    <div className="space-y-6">
      {/* Controles */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Mes */}
        <select
          value={mes}
          onChange={(e) => { setMes(e.target.value); navigate(e.target.value, silencio); }}
          className="rounded-md border bg-background px-3 py-1.5 text-sm"
        >
          {meses.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        {/* Días de silencio */}
        <div className="inline-flex items-center gap-1 rounded-md bg-muted p-1">
          {SILENCIO_OPTS.map((o) => (
            <button
              key={o.dias}
              onClick={() => { setSilencio(o.dias); navigate(mes, o.dias); }}
              className={cn(
                "rounded-sm px-3 py-1.5 text-sm font-medium transition-colors",
                silencio === o.dias
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Cuentas que hicieron su primer pedido de este mes después de ≥{silencio} días sin comprar.
      </p>

      {loading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">Calculando...</div>
      ) : reactivadas.length === 0 ? (
        <div className="py-12 text-center text-sm text-muted-foreground">
          Sin cuentas reactivadas en este período con ≥{silencio} días de silencio.
        </div>
      ) : (
        <>
          {/* Resumen por vendedor */}
          {isAdmin && porVendedor.length > 0 && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {porVendedor.map((r, i) => (
                <button
                  key={r.rep_id}
                  onClick={() => setRepFilter(repFilter === r.rep_id ? null : r.rep_id)}
                  className={cn(
                    "rounded-xl border p-4 text-left transition-colors hover:bg-muted/50",
                    repFilter === r.rep_id && "border-brand-carmesi bg-brand-carmesi/5",
                  )}
                >
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">{r.rep_name.split(" ")[0]}</p>
                    {i === 0 && <Award className="h-4 w-4 text-amber-500" />}
                  </div>
                  <p className="font-display text-2xl text-brand-carmesi">{r.total}</p>
                  <p className="text-xs text-muted-foreground">reactivadas</p>
                </button>
              ))}
              {repFilter && (
                <button
                  onClick={() => setRepFilter(null)}
                  className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground hover:bg-muted/40"
                >
                  Ver todas
                </button>
              )}
            </div>
          )}

          {/* Tabla de cuentas */}
          <Card>
            <CardContent className="p-0">
              <div className="border-b p-4">
                <h2 className="font-display text-lg">
                  {displayed.length} cuenta{displayed.length !== 1 ? "s" : ""} reactivada{displayed.length !== 1 ? "s" : ""}
                </h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/30 text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2 text-left">Cliente</th>
                      {isAdmin && <th className="px-4 py-2 text-left">Vendedor</th>}
                      <th className="px-4 py-2 text-left">Región</th>
                      <th className="px-4 py-2 text-right">Último pedido anterior</th>
                      <th className="px-4 py-2 text-right">Primer pedido del mes</th>
                      <th className="px-4 py-2 text-right">Días sin comprar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayed.map((r) => (
                      <tr key={r.account_id} className="border-t hover:bg-muted/20">
                        <td className="px-4 py-2 font-medium">
                          <Link
                            href={`/cuentas/${r.account_id}`}
                            className="text-brand-carmesi hover:underline"
                          >
                            {r.account_name}
                          </Link>
                        </td>
                        {isAdmin && (
                          <td className="px-4 py-2 text-muted-foreground">{r.rep_name}</td>
                        )}
                        <td className="px-4 py-2 text-muted-foreground">{r.region ?? "—"}</td>
                        <td className="px-4 py-2 text-right text-muted-foreground">
                          {formatDate(r.ultimo_pedido_anterior)}
                        </td>
                        <td className="px-4 py-2 text-right">{formatDate(r.primer_pedido_mes)}</td>
                        <td className="px-4 py-2 text-right">
                          <Badge variant={r.dias_silencio >= 90 ? "danger" : r.dias_silencio >= 60 ? "warning" : "muted"}>
                            {r.dias_silencio} días
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
