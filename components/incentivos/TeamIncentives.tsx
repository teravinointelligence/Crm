"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Medal, Settings2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ReglasPrograma } from "@/components/incentivos/ReglasPrograma";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TableScroll } from "@/components/ui/table-scroll";
import { REP_PALETTE } from "@/lib/colors";
import {
  LEVEL_SWATCH,
  NO_LEVEL_LABEL,
  cumulativeRewardByLevel,
  currentLevel,
  fullYearSeries,
  monthLabel,
  nextLevel,
  projectToDecember,
  rewardValueReached,
  summarizeByRep,
  type IncentiveDetailRow,
  type IncentiveLevel,
  type IncentiveProgram,
} from "@/lib/incentivos";

const mxn = (n: number) =>
  n.toLocaleString("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });
const num = (n: number) => n.toLocaleString("es-MX", { maximumFractionDigits: 0 });

// Recharts toca el DOM al medir: render solo en cliente (mismo patrón que /reportes).
function useMounted() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}

function LevelBadge({ level }: { level: IncentiveLevel | null }) {
  if (!level) {
    return (
      <Badge variant="outline" className="whitespace-nowrap text-muted-foreground">
        {NO_LEVEL_LABEL}
      </Badge>
    );
  }
  const sw = LEVEL_SWATCH[level.name];
  return (
    <Badge
      className="gap-1 whitespace-nowrap border"
      style={{ background: sw?.bg, color: sw?.fg, borderColor: sw?.solid }}
    >
      <Medal className="h-3.5 w-3.5" /> {level.name}
    </Badge>
  );
}

export function TeamIncentives({
  program,
  levels,
  rows,
  participantNames,
}: {
  program: IncentiveProgram;
  levels: IncentiveLevel[];
  rows: IncentiveDetailRow[];
  /** rep_id → nombre, para mostrar también a participantes sin ventas (Citlali). */
  participantNames: Record<string, string>;
}) {
  const mounted = useMounted();
  // El admin puede comparar la vista del programa (cobrado) contra lo facturado.
  const [modo, setModo] = useState<"programa" | "facturado">("programa");
  const requirePaid = modo === "programa" && program.require_paid;

  const summaries = useMemo(() => {
    const s = summarizeByRep(rows, requirePaid);
    // Participantes sin ventas también aparecen (con 0).
    for (const [id, name] of Object.entries(participantNames)) {
      if (!s.some((x) => x.repId === id)) {
        s.push({
          repId: id,
          repName: name,
          points: 0,
          bottles: 0,
          pointsFacturado: 0,
          bottlesFacturado: 0,
          byCategory: new Map(),
          byMonth: [],
        });
      }
    }
    return s.sort((a, b) => b.points - a.points);
  }, [rows, requirePaid, participantNames]);

  const hoy = new Date();
  const filas = summaries.map((s) => {
    const points = Math.round(s.points);
    const nivel = currentLevel(points, levels);
    const sig = nextLevel(points, levels);
    const proy = projectToDecember(points, program.start_date, hoy);
    return {
      ...s,
      points,
      nivel,
      sig,
      faltan: sig ? sig.points_required - points : 0,
      ganadoMxn: rewardValueReached(points, levels),
      proyPts: proy?.points ?? 0,
      proyNivel: proy ? currentLevel(proy.points, levels) : null,
      proyMxn: proy ? rewardValueReached(proy.points, levels) : 0,
    };
  });

  const acumPorNivel = cumulativeRewardByLevel(levels);
  const totPts = filas.reduce((a, f) => a + f.points, 0);
  const totBot = filas.reduce((a, f) => a + f.bottles, 0);
  const totGanado = filas.reduce((a, f) => a + f.ganadoMxn, 0);
  const totProyectado = filas.reduce((a, f) => a + f.proyMxn, 0);

  // Serie mensual comparativa: un dato por mes con una llave por vendedor.
  const serie = useMemo(() => {
    const year = fullYearSeries([], program.start_date);
    return year.map((m) => {
      const punto: Record<string, number | string> = { mes: monthLabel(m.period) };
      for (const s of summaries) {
        punto[s.repName] = Math.round(s.byMonth.find((x) => x.period === m.period)?.points ?? 0);
      }
      return punto;
    });
  }, [summaries, program.start_date]);

  return (
    <div className="space-y-6">
      {/* Totales del equipo — lo que se reporta a Gerard Bertrand */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Puntos del equipo</p>
            <p className="font-display text-2xl text-carmesi">{num(totPts)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Botellas GB</p>
            <p className="font-display text-2xl">{num(totBot)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Recompensas comprometidas</p>
            <p className="font-display text-2xl text-oro">{mxn(totGanado)}</p>
            <p className="text-[11px] text-muted-foreground">financia Gerard Bertrand</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Comprometido proyectado a dic</p>
            <p className="font-display text-2xl text-oro">{mxn(totProyectado)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Leaderboard */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base">Leaderboard del equipo</CardTitle>
              <CardDescription>
                {requirePaid
                  ? "Puntos con cobranza al corriente (regla del programa)"
                  : "Puntos sobre lo facturado (como el corte oficial GB)"}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {program.require_paid && (
                <select
                  className="rounded-md border bg-background px-2 py-1.5 text-sm"
                  value={modo}
                  onChange={(e) => setModo(e.target.value as "programa" | "facturado")}
                >
                  <option value="programa">Cobrado (programa)</option>
                  <option value="facturado">Facturado (corte GB)</option>
                </select>
              )}
              <Button asChild variant="outline" size="sm">
                <Link href="/incentivos/gestion">
                  <Settings2 className="mr-1 h-4 w-4" /> Gestión
                </Link>
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <TableScroll>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                  <th className="py-2 pr-3">Vendedor</th>
                  <th className="py-2 pr-3 text-right">Botellas</th>
                  <th className="py-2 pr-3 text-right">Puntos</th>
                  <th className="py-2 pr-3">Nivel</th>
                  <th className="py-2 pr-3 text-right">Ganado MXN</th>
                  <th className="py-2 pr-3">Siguiente nivel</th>
                  <th className="py-2 pr-3 text-right">Proyección dic</th>
                  <th className="py-2">Nivel proyectado</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => (
                  <tr key={f.repId} className="border-b last:border-0 hover:bg-muted/40">
                    <td className="py-2 pr-3">
                      <Link href={`/incentivos?rep=${f.repId}`} className="font-medium text-carmesi hover:underline">
                        {f.repName}
                      </Link>
                    </td>
                    <td className="py-2 pr-3 text-right">{num(f.bottles)}</td>
                    <td className="py-2 pr-3 text-right font-semibold">{num(f.points)}</td>
                    <td className="py-2 pr-3"><LevelBadge level={f.nivel} /></td>
                    <td className="py-2 pr-3 text-right">{f.ganadoMxn ? mxn(f.ganadoMxn) : "—"}</td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {f.sig ? (
                        <>
                          {f.sig.name} <span className="text-xs text-muted-foreground">(faltan {num(f.faltan)})</span>
                        </>
                      ) : (
                        "Máximo 🏆"
                      )}
                    </td>
                    <td className="py-2 pr-3 text-right">{num(f.proyPts)}</td>
                    <td className="py-2"><LevelBadge level={f.proyNivel} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        </CardContent>
      </Card>

      {/* Niveles de recompensa — la escala oficial del programa */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Niveles de recompensa · acumulables</CardTitle>
          <CardDescription>
            Alcanzar un nivel gana esa recompensa ADEMÁS de las anteriores. Financia {program.provider}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TableScroll>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                  <th className="py-2 pr-3">Nivel</th>
                  <th className="py-2 pr-3 text-right">Pts requeridos</th>
                  <th className="py-2 pr-3">Recompensa</th>
                  <th className="py-2 pr-3 text-right">Valor MXN</th>
                  <th className="py-2 text-right">Acum. MXN</th>
                </tr>
              </thead>
              <tbody>
                {levels.map((l) => (
                  <tr key={l.id} className="border-b last:border-0">
                    <td className="py-2 pr-3"><LevelBadge level={l} /></td>
                    <td className="py-2 pr-3 text-right font-medium">{num(l.points_required)}</td>
                    <td className="py-2 pr-3">{l.reward}</td>
                    <td className="py-2 pr-3 text-right">{mxn(Number(l.reward_value_mxn))}</td>
                    <td className="py-2 text-right font-semibold text-oro">{mxn(acumPorNivel.get(l.id) ?? 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        </CardContent>
      </Card>

      {/* Comparativo mensual */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Puntos por mes y vendedor</CardTitle>
        </CardHeader>
        <CardContent>
          {mounted && (
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={serie}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="mes" tickLine={false} axisLine={false} fontSize={12} />
                <YAxis tickLine={false} axisLine={false} fontSize={12} width={36} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {summaries.map((s, i) => (
                  <Bar
                    key={s.repId}
                    dataKey={s.repName}
                    fill={REP_PALETTE[i % REP_PALETTE.length].solid}
                    radius={[3, 3, 0, 0]}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
          )}
        </CardContent>
      </Card>

      {/* Reglas y escala de puntos por vino */}
      <ReglasPrograma program={program} />
    </div>
  );
}
