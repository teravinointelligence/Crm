"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Trophy, Flame, TrendingUp, CalendarCheck2 } from "lucide-react";

const MEDALS = ["🥇", "🥈", "🥉"];
const TAB_LABELS = [
  { key: "actividades", label: "Actividades", icon: CalendarCheck2 },
  { key: "pedidos", label: "Pedidos", icon: TrendingUp },
] as const;

type Tab = "actividades" | "pedidos";

type RepRow = {
  rep_id: string;
  rep_name: string;
  actividades: number;
  pedidos: number;
  racha: number;
  posicion: number;
};

function firstName(name: string) {
  return name.split(" ")[0];
}

function PodiumBar({ value, max, highlight }: { value: number; max: number; highlight: boolean }) {
  const pct = max > 0 ? Math.max(8, Math.round((value / max) * 100)) : 8;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <div
        className={cn(
          "h-full rounded-full transition-all duration-700",
          highlight ? "bg-brand-carmesi" : "bg-muted-foreground/40",
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function LeaderboardCard({ myRepId }: { myRepId: string }) {
  const [tab, setTab] = useState<Tab>("actividades");
  const [standings, setStandings] = useState<RepRow[]>([]);
  const [semana, setSemana] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/dashboard/leaderboard")
      .then((r) => r.json())
      .then((d) => {
        setStandings(d.standings ?? []);
        setSemana(d.semana ?? "");
      })
      .finally(() => setLoading(false));
  }, []);

  // Ordenar según la tab activa
  const sorted = [...standings].sort((a, b) =>
    tab === "actividades"
      ? b.actividades - a.actividades || b.pedidos - a.pedidos
      : b.pedidos - a.pedidos || b.actividades - a.actividades,
  );

  const maxVal = Math.max(...sorted.map((s) => s[tab]), 1);

  // Posición del usuario actual
  const myPos = sorted.findIndex((s) => s.rep_id === myRepId);
  const myRow = sorted[myPos];

  function semanaLabel(iso: string) {
    if (!iso) return "";
    const d = new Date(iso + "T12:00:00");
    return d.toLocaleDateString("es-MX", { day: "numeric", month: "short" });
  }

  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-amber-500" />
            <h2 className="font-display text-lg">Tabla de posiciones</h2>
          </div>
          {semana && (
            <span className="text-xs text-muted-foreground">
              Semana desde {semanaLabel(semana)}
            </span>
          )}
        </div>

        {/* Tabs */}
        <div className="inline-flex items-center gap-1 rounded-md bg-muted p-1">
          {TAB_LABELS.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-sm px-3 py-1.5 text-sm font-medium transition-colors",
                  tab === t.key
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {t.label}
              </button>
            );
          })}
        </div>

        {loading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Cargando...</div>
        ) : sorted.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Sin datos esta semana.</div>
        ) : (
          <div className="space-y-2">
            {sorted.map((s, i) => {
              const isMe = s.rep_id === myRepId;
              const val = s[tab];
              return (
                <div
                  key={s.rep_id}
                  className={cn(
                    "flex items-center gap-3 rounded-lg p-2.5 transition-colors",
                    isMe
                      ? "bg-brand-carmesi/5 ring-1 ring-brand-carmesi/30"
                      : "hover:bg-muted/40",
                  )}
                >
                  {/* Posición / medalla */}
                  <div className="w-6 shrink-0 text-center text-lg leading-none">
                    {i < 3 ? MEDALS[i] : <span className="text-xs text-muted-foreground">{i + 1}</span>}
                  </div>

                  {/* Nombre + barra */}
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className={cn("truncate text-sm font-medium", isMe && "text-brand-carmesi")}>
                        {firstName(s.rep_name)}
                        {isMe && <span className="ml-1 text-xs font-normal text-muted-foreground">(tú)</span>}
                      </span>
                      <span className={cn("shrink-0 font-display text-base tabular-nums", isMe ? "text-brand-carmesi" : "")}>
                        {val}
                      </span>
                    </div>
                    <PodiumBar value={val} max={maxVal} highlight={isMe} />
                  </div>

                  {/* Racha */}
                  {s.racha > 0 && (
                    <div className="flex shrink-0 items-center gap-0.5 text-xs text-amber-600">
                      <Flame className="h-3.5 w-3.5" />
                      <span className="font-medium">{s.racha}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          🔥 = días consecutivos con ≥2 actividades cumplidas
        </p>
      </CardContent>
    </Card>
  );
}
