"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { TrendingUp, Target, Award } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const TIPO_LABEL: Record<string, string> = {
  visita: "Visita",
  llamada: "Llamada",
  email: "Email",
  whatsapp: "WhatsApp",
  degustacion: "Degustación",
  reunion: "Reunión",
  evento: "Evento",
  otro: "Otro",
};

const PERIODOS = [
  { label: "30 días", dias: 30 },
  { label: "60 días", dias: 60 },
  { label: "90 días", dias: 90 },
  { label: "6 meses", dias: 180 },
];

type TipoStat = { total: number; convertidas: number };

type RepStat = {
  rep_id: string;
  rep_name: string;
  total: number;
  convertidas: number;
  tasa: number;
  por_tipo: Record<string, TipoStat>;
};

function tasaColor(tasa: number) {
  if (tasa >= 40) return "text-emerald-600";
  if (tasa >= 20) return "text-amber-600";
  return "text-red-500";
}

function tasaBadge(tasa: number): "success" | "warning" | "danger" {
  if (tasa >= 40) return "success";
  if (tasa >= 20) return "warning";
  return "danger";
}

function GaugeBar({ tasa }: { tasa: number }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
      <div
        className={cn(
          "h-full rounded-full transition-all duration-500",
          tasa >= 40 ? "bg-emerald-500" : tasa >= 20 ? "bg-amber-400" : "bg-red-400",
        )}
        style={{ width: `${Math.min(100, tasa)}%` }}
      />
    </div>
  );
}

export function ConversionClient({
  isAdmin,
  reps,
  initialDias,
  initialRep,
}: {
  isAdmin: boolean;
  reps: { id: string; full_name: string }[];
  initialDias: number;
  initialRep: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [dias, setDias] = useState(initialDias);
  const [repFilter, setRepFilter] = useState(initialRep);
  const [stats, setStats] = useState<RepStat[]>([]);
  const [ventana, setVentana] = useState(30);
  const [loading, setLoading] = useState(true);

  function navigate(d: number, r: string | null) {
    const p = new URLSearchParams();
    p.set("dias", String(d));
    if (r) p.set("rep", r);
    router.replace(`${pathname}?${p.toString()}`);
  }

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ dias: String(dias) });
    if (repFilter) params.set("rep", repFilter);
    fetch(`/api/activities/conversion?${params}`)
      .then((r) => r.json())
      .then((d) => {
        setStats(d.stats ?? []);
        setVentana(d.ventana_dias ?? 30);
      })
      .finally(() => setLoading(false));
  }, [dias, repFilter]);

  const totalActs = stats.reduce((s, r) => s + r.total, 0);
  const totalConv = stats.reduce((s, r) => s + r.convertidas, 0);
  const tasaGlobal = totalActs > 0 ? Math.round((totalConv / totalActs) * 1000) / 10 : 0;

  return (
    <div className="space-y-6">
      {/* Controles */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Período */}
        <div className="inline-flex items-center gap-1 rounded-md bg-muted p-1">
          {PERIODOS.map((p) => (
            <button
              key={p.dias}
              onClick={() => { setDias(p.dias); navigate(p.dias, repFilter); }}
              className={cn(
                "rounded-sm px-3 py-1.5 text-sm font-medium transition-colors",
                dias === p.dias
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Filtro vendedor (solo admin) */}
        {isAdmin && reps.length > 0 && (
          <div className="inline-flex items-center gap-1 rounded-md bg-muted p-1">
            <button
              onClick={() => { setRepFilter(null); navigate(dias, null); }}
              className={cn(
                "rounded-sm px-3 py-1.5 text-sm font-medium transition-colors",
                !repFilter
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Todos
            </button>
            {reps.map((r) => (
              <button
                key={r.id}
                onClick={() => { setRepFilter(r.id); navigate(dias, r.id); }}
                className={cn(
                  "rounded-sm px-3 py-1.5 text-sm font-medium transition-colors",
                  repFilter === r.id
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {r.full_name.split(" ")[0]}
              </button>
            ))}
          </div>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Una actividad "convierte" si la cuenta hizo un pedido en los {ventana} días siguientes.
      </p>

      {loading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">Calculando...</div>
      ) : stats.length === 0 ? (
        <div className="py-12 text-center text-sm text-muted-foreground">
          Sin actividades realizadas en este período.
        </div>
      ) : (
        <>
          {/* Resumen global */}
          <div className="grid grid-cols-3 gap-3">
            <Card>
              <CardContent className="p-4">
                <p className="text-xs uppercase text-muted-foreground">Actividades</p>
                <p className="font-display text-2xl">{totalActs}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs uppercase text-muted-foreground">Convirtieron</p>
                <p className="font-display text-2xl text-emerald-600">{totalConv}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs uppercase text-muted-foreground">Tasa global</p>
                <p className={cn("font-display text-2xl", tasaColor(tasaGlobal))}>
                  {tasaGlobal}%
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Tabla por vendedor */}
          <Card>
            <CardContent className="p-0">
              <div className="border-b p-4">
                <h2 className="font-display text-lg">Por vendedor</h2>
              </div>
              <div className="divide-y">
                {stats.map((s, i) => (
                  <div key={s.rep_id} className="space-y-3 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        {i === 0 && isAdmin && (
                          <Award className="h-4 w-4 text-amber-500" />
                        )}
                        <span className="font-medium">{s.rep_name}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm text-muted-foreground">
                          {s.convertidas}/{s.total}
                        </span>
                        <Badge variant={tasaBadge(s.tasa)} className="min-w-[3.5rem] justify-center">
                          {s.tasa}%
                        </Badge>
                      </div>
                    </div>
                    <GaugeBar tasa={s.tasa} />

                    {/* Desglose por tipo de actividad */}
                    {Object.keys(s.por_tipo).length > 1 && (
                      <div className="flex flex-wrap gap-x-4 gap-y-1 pl-1">
                        {Object.entries(s.por_tipo)
                          .sort((a, b) => b[1].total - a[1].total)
                          .map(([tipo, t]) => {
                            const tasa = t.total > 0 ? Math.round((t.convertidas / t.total) * 100) : 0;
                            return (
                              <span key={tipo} className="text-xs text-muted-foreground">
                                {TIPO_LABEL[tipo] ?? tipo}:{" "}
                                <span className={cn("font-medium", tasaColor(tasa))}>
                                  {tasa}%
                                </span>{" "}
                                <span className="opacity-60">({t.convertidas}/{t.total})</span>
                              </span>
                            );
                          })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
