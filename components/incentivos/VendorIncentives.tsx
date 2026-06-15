"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Award, Lock, Medal, Sparkles, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ReglasPrograma } from "@/components/incentivos/ReglasPrograma";
import { Badge } from "@/components/ui/badge";
import { TableScroll } from "@/components/ui/table-scroll";
import {
  CATEGORY_ORDER,
  LEVEL_SWATCH,
  NO_LEVEL_LABEL,
  cumulativeRewardByLevel,
  currentLevel,
  fullYearSeries,
  levelsReached,
  monthLabel,
  nextLevel,
  projectToDecember,
  rewardValueReached,
  simulatorEquivalences,
  summarizeByRep,
  type IncentiveDetailRow,
  type IncentiveLevel,
  type IncentiveProgram,
} from "@/lib/incentivos";

const mxn = (n: number) =>
  n.toLocaleString("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });
const num = (n: number) => n.toLocaleString("es-MX", { maximumFractionDigits: 0 });

function useMounted() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}

export function VendorIncentives({
  program,
  levels,
  rows,
  repId,
  repName,
  isSelf,
  seenPoints,
}: {
  program: IncentiveProgram;
  levels: IncentiveLevel[];
  rows: IncentiveDetailRow[];
  repId: string;
  repName: string;
  /** true cuando el vendedor ve SU propia página (activa la notificación "+X pts"). */
  isSelf: boolean;
  seenPoints: number | null;
}) {
  const mounted = useMounted();
  const [mesFiltro, setMesFiltro] = useState<string>("");
  const [celebrar, setCelebrar] = useState<IncentiveLevel | null>(null);

  const summary = useMemo(() => {
    const s = summarizeByRep(rows, program.require_paid);
    return (
      s.find((x) => x.repId === repId) ?? {
        repId,
        repName,
        points: 0,
        bottles: 0,
        pointsFacturado: 0,
        bottlesFacturado: 0,
        byCategory: new Map(),
        byMonth: [],
      }
    );
  }, [rows, program.require_paid, repId, repName]);

  const points = Math.round(summary.points);
  const enCamino = Math.round(summary.pointsFacturado - summary.points);
  const nivel = currentLevel(points, levels);
  const siguiente = nextLevel(points, levels);
  const ganadoMxn = rewardValueReached(points, levels);
  const reached = levelsReached(points, levels);
  const proyeccion = projectToDecember(points, program.start_date, new Date());
  const nivelProyectado = proyeccion ? currentLevel(proyeccion.points, levels) : null;
  const faltan = siguiente ? siguiente.points_required - points : 0;
  const equivalencias = simulatorEquivalences(faltan);
  const acumPorNivel = cumulativeRewardByLevel(levels);

  // Barra de progreso: del nivel anterior al siguiente.
  const baseAnterior = nivel?.points_required ?? 0;
  const meta = siguiente?.points_required ?? nivel?.points_required ?? 1;
  const pct = siguiente
    ? Math.min(100, Math.round(((points - baseAnterior) / (meta - baseAnterior)) * 100))
    : 100;

  // Notificación ligera: "+X pts" desde la última visita y celebración si
  // se cruzó un nivel. Solo en la página propia del vendedor.
  useEffect(() => {
    if (!isSelf || seenPoints === null) return;
    const delta = points - seenPoints;
    if (delta <= 0) return;
    toast.success(`+${num(delta)} pts Gerard Bertrand`, {
      description: "desde tu última visita 🍷",
    });
    const nuevos = levelsReached(points, levels).filter(
      (l) => seenPoints < l.points_required,
    );
    if (nuevos.length) setCelebrar(nuevos[nuevos.length - 1]);
    const supabase = createClient();
    void supabase
      .from("incentive_points_seen")
      .upsert({ program_id: program.id, rep_id: repId, points_seen: points, updated_at: new Date().toISOString() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const serieAnual = fullYearSeries(summary.byMonth, program.start_date);
  const mesesConVenta = [...new Set(rows.map((r) => r.period))].sort();
  const detalle = rows
    .filter((r) => !mesFiltro || r.period === mesFiltro)
    .sort((a, b) => b.period.localeCompare(a.period) || b.points - a.points);

  const swatch = nivel ? LEVEL_SWATCH[nivel.name] : null;

  return (
    <div className="space-y-6">
      {/* Celebración de nivel: sobria, dorada, sin confeti infantil */}
      {celebrar && (
        <div
          className="relative overflow-hidden rounded-xl border p-5 text-center"
          style={{ borderColor: LEVEL_SWATCH[celebrar.name]?.solid, background: LEVEL_SWATCH[celebrar.name]?.bg }}
        >
          <style>{`@keyframes inc-shimmer { 0% { transform: translateX(-100%); } 100% { transform: translateX(200%); } }`}</style>
          <div
            className="pointer-events-none absolute inset-y-0 w-1/3 opacity-40"
            style={{
              background: "linear-gradient(105deg, transparent, #fff, transparent)",
              animation: "inc-shimmer 2.2s ease-in-out infinite",
            }}
          />
          <Sparkles className="mx-auto h-7 w-7" style={{ color: LEVEL_SWATCH[celebrar.name]?.solid }} />
          <p className="mt-1 font-display text-2xl" style={{ color: LEVEL_SWATCH[celebrar.name]?.fg }}>
            ¡Nivel {celebrar.name} alcanzado!
          </p>
          <p className="text-sm" style={{ color: LEVEL_SWATCH[celebrar.name]?.fg }}>
            Ganaste: {celebrar.reward} ({mxn(Number(celebrar.reward_value_mxn))})
          </p>
        </div>
      )}

      {/* Hero */}
      <Card className="overflow-hidden">
        <div className="h-1.5 w-full" style={{ background: "linear-gradient(90deg,#A91E3A,#c9a96e)" }} />
        <CardContent className="pt-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm text-muted-foreground">{program.name} · {repName}</p>
              <div className="flex items-end gap-2">
                <span className="font-display text-5xl text-carmesi">{num(points)}</span>
                <span className="pb-1.5 text-sm text-muted-foreground">pts</span>
              </div>
              {program.require_paid && enCamino > 0 && (
                <p className="mt-1 text-xs text-muted-foreground">
                  +{num(enCamino)} pts facturados en camino (se confirman al cobrarse)
                </p>
              )}
            </div>
            <div className="text-left sm:text-right">
              {nivel ? (
                <Badge
                  className="gap-1 border px-3 py-1.5 text-sm"
                  style={{ background: swatch?.bg, color: swatch?.fg, borderColor: swatch?.solid }}
                >
                  <Medal className="h-4 w-4" /> {nivel.name}
                </Badge>
              ) : (
                <Badge variant="outline" className="px-3 py-1.5 text-sm text-muted-foreground">
                  {NO_LEVEL_LABEL}
                </Badge>
              )}
              {ganadoMxn > 0 && (
                <p className="mt-1.5 text-sm">
                  Recompensas ganadas: <span className="font-semibold text-carmesi">{mxn(ganadoMxn)}</span>
                </p>
              )}
            </div>
          </div>

          {/* Progreso al siguiente nivel */}
          <div className="mt-5">
            {siguiente ? (
              <>
                <div className="flex items-baseline justify-between text-sm">
                  <span className="font-medium">Rumbo a {siguiente.name}</span>
                  <span className="text-muted-foreground">
                    faltan <span className="font-semibold text-foreground">{num(faltan)} pts</span> · {pct}%
                  </span>
                </div>
                <div className="mt-1.5 h-3 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${pct}%`, background: "linear-gradient(90deg,#A91E3A,#c9a96e)" }}
                  />
                </div>
                <div className="mt-1 flex justify-between text-xs text-muted-foreground">
                  <span>{num(baseAnterior)}</span>
                  <span>{num(siguiente.points_required)} pts</span>
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Al llegar a {num(siguiente.points_required)} pts ganas {siguiente.reward}{" "}
                  ({mxn(Number(siguiente.reward_value_mxn))}) y acumulas{" "}
                  <span className="font-semibold text-oro">{mxn(acumPorNivel.get(siguiente.id) ?? 0)}</span> en recompensas.
                </p>
              </>
            ) : (
              <p className="text-sm font-medium" style={{ color: LEVEL_SWATCH.Platino.fg }}>
                Alcanzaste el nivel máximo del programa. 🏆
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Recompensas (acumulables) */}
      <div>
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="font-display text-xl">Recompensas</h2>
          <span className="text-xs text-muted-foreground">Acumulables: cada nivel se gana ADEMÁS de los anteriores</span>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {levels.map((l) => {
            const ganado = reached.some((r) => r.id === l.id);
            const sw = LEVEL_SWATCH[l.name];
            return (
              <Card
                key={l.id}
                className={ganado ? "border-2" : "opacity-70"}
                style={ganado ? { borderColor: sw?.solid, background: sw?.bg } : undefined}
              >
                <CardContent className="pt-4">
                  <div className="flex items-center justify-between">
                    <Badge
                      className="gap-1 border"
                      style={
                        ganado
                          ? { background: sw?.solid, color: "#fff", borderColor: sw?.solid }
                          : { background: "transparent", color: "inherit" }
                      }
                      variant={ganado ? undefined : "outline"}
                    >
                      {ganado ? <Award className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
                      {l.name}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{num(l.points_required)} pts</span>
                  </div>
                  <p className="mt-2 text-sm font-medium" style={ganado ? { color: sw?.fg } : undefined}>
                    {l.reward}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {mxn(Number(l.reward_value_mxn))} · acumulado{" "}
                    <span className="font-medium">{mxn(acumPorNivel.get(l.id) ?? 0)}</span>
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Proyección + simulador */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-4 w-4 text-carmesi" /> Proyección a diciembre
            </CardTitle>
            <CardDescription>
              Tu ritmo actual ({proyeccion ? `${proyeccion.monthsElapsed} meses` : "—"}) llevado a fin de año
            </CardDescription>
          </CardHeader>
          <CardContent>
            {proyeccion ? (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <span className="font-display text-3xl">{num(proyeccion.points)} pts</span>
                {nivelProyectado ? (
                  <>
                    <Badge
                      className="gap-1 border"
                      style={{
                        background: LEVEL_SWATCH[nivelProyectado.name]?.bg,
                        color: LEVEL_SWATCH[nivelProyectado.name]?.fg,
                        borderColor: LEVEL_SWATCH[nivelProyectado.name]?.solid,
                      }}
                    >
                      <Medal className="h-3.5 w-3.5" /> {nivelProyectado.name} proyectado
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      acumularías <span className="font-semibold text-oro">{mxn(acumPorNivel.get(nivelProyectado.id) ?? 0)}</span>
                    </span>
                  </>
                ) : (
                  <Badge variant="outline" className="text-muted-foreground">{NO_LEVEL_LABEL}</Badge>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">La proyección aparece al cerrar el primer mes del programa.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">¿Cuánto me falta?</CardTitle>
            <CardDescription>
              {siguiente
                ? `Para ${siguiente.name} te faltan ${num(faltan)} pts. La mezcla premium pesa más que el volumen:`
                : "Nivel máximo alcanzado."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {equivalencias.map((e) => (
              <div key={e.label} className="flex items-baseline justify-between gap-2 text-sm">
                <span className="truncate">{e.label}</span>
                <span className="whitespace-nowrap font-medium">
                  ≈ {num(e.bottles)} bot <span className="text-xs text-muted-foreground">({e.pts} pts c/u)</span>
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Desglose por categoría */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Desglose por categoría</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {CATEGORY_ORDER.map((cat) => {
              const c = summary.byCategory.get(cat) ?? { bottles: 0, points: 0 };
              return (
                <div key={cat} className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">{cat}</p>
                  <p className="font-display text-xl text-carmesi">{num(c.points)} pts</p>
                  <p className="text-xs text-muted-foreground">{num(c.bottles)} botellas</p>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Avance mensual */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Avance mensual</CardTitle>
          <CardDescription>Puntos por mes (ene–dic)</CardDescription>
        </CardHeader>
        <CardContent>
          {mounted && (
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={serieAnual.map((m) => ({ mes: monthLabel(m.period), pts: m.points }))}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="mes" tickLine={false} axisLine={false} fontSize={12} />
                  <YAxis tickLine={false} axisLine={false} fontSize={12} width={36} />
                  <Tooltip formatter={(v: number) => [`${num(v)} pts`, "Puntos"]} />
                  <Bar dataKey="pts" fill="#A91E3A" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detalle de ventas GB */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-base">Detalle de ventas Gerard Bertrand</CardTitle>
            <select
              className="rounded-md border bg-background px-2 py-1.5 text-sm"
              value={mesFiltro}
              onChange={(e) => setMesFiltro(e.target.value)}
            >
              <option value="">Todos los meses</option>
              {mesesConVenta.map((m) => (
                <option key={m} value={m}>
                  {monthLabel(m)} {m.slice(0, 4)}
                </option>
              ))}
            </select>
          </div>
          {program.require_paid && (
            <CardDescription>Solo suman puntos los meses con la cobranza al corriente.</CardDescription>
          )}
        </CardHeader>
        <CardContent>
          {detalle.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Sin ventas Gerard Bertrand registradas{mesFiltro ? " en ese mes" : ""}.
            </p>
          ) : (
            <TableScroll>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                    <th className="py-2 pr-3">Mes</th>
                    <th className="py-2 pr-3">Cliente</th>
                    <th className="py-2 pr-3">Producto</th>
                    <th className="py-2 pr-3">Categoría</th>
                    <th className="py-2 pr-3 text-right">Botellas</th>
                    <th className="py-2 pr-3 text-right">Puntos</th>
                    {program.require_paid && <th className="py-2 text-right">Cobrado</th>}
                  </tr>
                </thead>
                <tbody>
                  {detalle.map((r, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="py-2 pr-3 whitespace-nowrap">{monthLabel(r.period)} {r.period.slice(0, 4)}</td>
                      <td className="py-2 pr-3">{r.client_name ?? r.client_number}</td>
                      <td className="py-2 pr-3">{r.producto_nombre}</td>
                      <td className="py-2 pr-3">{r.category}</td>
                      <td className="py-2 pr-3 text-right">{num(Number(r.bottles))}</td>
                      <td className="py-2 pr-3 text-right font-medium">{num(Number(r.points))}</td>
                      {program.require_paid && (
                        <td className="py-2 text-right">
                          {r.cobrado ? (
                            <Badge className="bg-emerald-100 text-emerald-800">Sí</Badge>
                          ) : (
                            <Badge variant="outline" className="text-muted-foreground">Pendiente</Badge>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableScroll>
          )}
        </CardContent>
      </Card>

      {/* Reglas y escala de puntos por vino */}
      <ReglasPrograma program={program} />
    </div>
  );
}
