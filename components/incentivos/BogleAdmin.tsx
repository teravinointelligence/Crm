"use client";

import { Fragment, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Plane, RefreshCcw, XCircle } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TableScroll } from "@/components/ui/table-scroll";
import {
  PLACEMENT_ESTADO_LABEL,
  VISA_LABEL,
  daysRemaining,
  monthLabel,
  type IncentivePlacement,
  type IncentiveProgram,
  type IncentiveRaceRow,
} from "@/lib/incentivos";

const ORO = "#c9a96e";

export function BogleAdmin({
  program,
  placements,
  race,
}: {
  program: IncentiveProgram;
  placements: IncentivePlacement[];
  race: IncentiveRaceRow[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [openRep, setOpenRep] = useState<string | null>(null);

  const meta = program.meta_encartes ?? 10;
  const maxGanadores = program.max_ganadores ?? 2;
  const pendientes = placements.filter((p) => p.estado === "pendiente" || p.estado === "en_revision");
  const ganadores = race.filter((r) => r.es_ganador);
  const dias = daysRemaining(program.end_date, new Date());

  // ¿La cola pendiente puede estar afectando la carrera? Si alguien con
  // pendientes alcanzaría la meta al validárselos, hay que resolver YA.
  const colaCritica = race.filter((r) => r.validados < meta && r.validados + r.pendientes >= meta);

  // Clientes con la marca colocada, agrupados con sus variedades.
  const clientesEncartados = Array.from(
    placements
      .filter((p) => p.estado !== "rechazado")
      .reduce((m, p) => {
        const k = `${p.rep_id}·${p.account_id}`;
        const e = m.get(k) ?? {
          key: k,
          num: p.client_number,
          name: p.client_name,
          rep: race.find((r) => r.rep_id === p.rep_id)?.rep_name ?? "",
          items: [] as IncentivePlacement[],
        };
        e.items.push(p);
        m.set(k, e);
        return m;
      }, new Map<string, { key: string; num: string | null; name: string | null; rep: string; items: IncentivePlacement[] }>())
      .values()
  ).sort((a, b) => b.items.length - a.items.length || (a.name ?? "").localeCompare(b.name ?? ""));

  /** "BOGLE PINOT NOIR 12/750 ML" → "PINOT NOIR" (respaldo: el código). */
  const variedad = (p: IncentivePlacement) =>
    (p.producto ?? "")
      .replace(/^BOGLE\s+/i, "")
      .replace(/\s*\d+\/\d+\s*ML\.?\s*$/i, "")
      .trim() || p.codigo;

  const detectar = async () => {
    setBusy("detect");
    const { data, error } = await supabase.rpc("detect_incentive_placements", { p_program_id: program.id });
    setBusy(null);
    if (error) return void toast.error("Error al detectar", { description: error.message });
    toast.success(`Detección corrida: ${data ?? 0} encarte(s) nuevo(s)`);
    router.refresh();
  };

  const resolver = async (p: IncentivePlacement, estado: "validado" | "rechazado") => {
    const nota = estado === "rechazado" ? prompt("Motivo del rechazo (queda en el registro):") : null;
    if (estado === "rechazado" && nota === null) return;
    setBusy(p.id);
    const { data: me } = await supabase.from("sales_reps").select("id").eq("auth_user_id", (await supabase.auth.getUser()).data.user?.id ?? "").single();
    const { error } = await supabase
      .from("incentive_placements")
      .update({ estado, notas: nota || p.notas, validado_por: me?.id ?? null, validado_en: new Date().toISOString() })
      .eq("id", p.id);
    setBusy(null);
    if (error) return void toast.error("No se pudo actualizar", { description: error.message });
    toast.success(estado === "validado" ? "Encarte validado" : "Encarte rechazado");
    router.refresh();
  };

  const setVisa = async (repId: string, visa: string) => {
    const { error } = await supabase
      .from("incentive_participants")
      .update({ visa_status: visa })
      .eq("program_id", program.id)
      .eq("rep_id", repId);
    if (error) return void toast.error("No se pudo actualizar la visa", { description: error.message });
    toast.success("Visa actualizada");
    router.refresh();
  };

  const cerrarPrograma = async () => {
    if (!confirm("¿Cerrar el programa Bogle? Deja de detectar encartes y la UI muestra 'Cupos agotados'.")) return;
    const { error } = await supabase.from("incentive_programs").update({ estado: "cerrado" }).eq("id", program.id);
    if (error) return void toast.error("No se pudo cerrar", { description: error.message });
    toast.success("Programa cerrado");
    router.refresh();
  };

  return (
    <Card className="overflow-hidden border-2" style={{ borderColor: ORO }}>
      <div className="h-1.5 w-full" style={{ background: `linear-gradient(90deg,${ORO},#8A6D3B)` }} />
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 font-display text-xl">
              <Plane className="h-5 w-5" style={{ color: ORO }} /> Bogle 2026 · Carrera de encartes
            </CardTitle>
            <CardDescription>
              Primeros {maxGanadores} con {meta} encartes validados · {dias} días restantes ·{" "}
              {program.estado === "cerrado"
                ? `CERRADO${ganadores.length ? ` · Ganadores: ${ganadores.map((g) => g.rep_name).join(" y ")}` : ""}`
                : `${Math.max(0, maxGanadores - ganadores.length)} cupo(s) disponible(s)`}
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={busy === "detect" || program.estado === "cerrado"} onClick={detectar}>
              <RefreshCcw className="mr-1 h-3.5 w-3.5" /> Detectar / backfill
            </Button>
            {program.estado === "activo" && (
              <Button size="sm" variant="outline" onClick={cerrarPrograma}>Cerrar programa</Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {colaCritica.length > 0 && (
          <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-2.5 text-sm text-amber-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              La cola de validación puede estar definiendo la carrera:{" "}
              {colaCritica.map((r) => `${r.rep_name} (${r.validados}+${r.pendientes} pendientes)`).join(", ")}.
              Valida o rechaza esos encartes antes de declarar ganadores.
            </span>
          </div>
        )}

        {/* Leaderboard */}
        <TableScroll>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                <th className="py-2 pr-3">Vendedor</th>
                <th className="py-2 pr-3 text-right">Validados</th>
                <th className="py-2 pr-3 text-right">Pendientes</th>
                <th className="py-2 pr-3">% meta</th>
                <th className="py-2 pr-3">Fecha del 10º</th>
                <th className="py-2 pr-3">Visa</th>
                <th className="py-2">Estado</th>
              </tr>
            </thead>
            <tbody>
              {race.map((r) => {
                const visaAlerta = r.es_ganador && (r.visa_status === "sin_visa" || r.visa_status === "sin_informacion");
                const abierto = openRep === r.rep_id;
                const suyos = placements.filter((p) => p.rep_id === r.rep_id);
                return (
                  <Fragment key={r.rep_id}>
                  <tr className="border-b last:border-0">
                    <td className="py-2 pr-3 font-medium">
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 hover:underline"
                        title="Ver qué encartes le cuentan"
                        onClick={() => setOpenRep(abierto ? null : r.rep_id)}
                      >
                        {abierto ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                        {r.rep_name}
                      </button>
                    </td>
                    <td className="py-2 pr-3 text-right font-semibold">{r.validados}</td>
                    <td className="py-2 pr-3 text-right">{r.pendientes || "—"}</td>
                    <td className="py-2 pr-3">
                      <div className="h-2 w-24 overflow-hidden rounded-full bg-muted">
                        <div className="h-full" style={{ width: `${Math.min(100, (r.validados / meta) * 100)}%`, background: ORO }} />
                      </div>
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap">{r.fecha_meta ?? "—"}</td>
                    <td className="py-2 pr-3">
                      <select
                        className={`rounded-md border bg-background px-1.5 py-1 text-xs ${visaAlerta ? "border-red-400 text-red-700" : ""}`}
                        value={r.visa_status ?? "sin_informacion"}
                        onChange={(e) => setVisa(r.rep_id, e.target.value)}
                      >
                        {Object.entries(VISA_LABEL).map(([v, l]) => (
                          <option key={v} value={v}>{l}</option>
                        ))}
                      </select>
                      {visaAlerta && <span className="ml-1 text-xs text-red-600">⚠</span>}
                    </td>
                    <td className="py-2">
                      {r.es_ganador ? (
                        <Badge className="border" style={{ background: "#F5EDDD", color: "#8A6D3B", borderColor: ORO }}>
                          🏆 Calificó ({r.posicion}º)
                        </Badge>
                      ) : r.validados >= meta ? (
                        <Badge variant="outline">Llegó sin cupo</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">faltan {meta - r.validados}</span>
                      )}
                    </td>
                  </tr>
                  {abierto && (
                    <tr className="border-b bg-muted/40 last:border-0">
                      <td colSpan={7} className="px-3 py-2">
                        {suyos.length === 0 ? (
                          <p className="text-xs text-muted-foreground">Sin encartes detectados todavía.</p>
                        ) : (
                          <ul className="space-y-1">
                            {suyos.map((p) => (
                              <li key={p.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                                <span
                                  className={
                                    p.estado === "validado"
                                      ? "font-medium"
                                      : p.estado === "rechazado"
                                        ? "text-muted-foreground line-through"
                                        : "font-medium text-amber-700"
                                  }
                                >
                                  #{p.client_number} {p.client_name}
                                </span>
                                <span className="text-muted-foreground">
                                  {p.producto ? `· ${p.producto} ` : ""}· {monthLabel(p.period)} {p.period.slice(0, 4)} ·{" "}
                                  {program.require_paid ? "cobrado el" : "factura del"} {p.fecha_deteccion} ·{" "}
                                  {PLACEMENT_ESTADO_LABEL[p.estado]}
                                  {p.estado === "rechazado" && p.notas ? ` (${p.notas})` : ""}
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                    </tr>
                  )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </TableScroll>
        <p className="text-xs text-muted-foreground">
          Cupo sujeto a visa estadounidense vigente — si un ganador no cuenta con ella, resolver con el proveedor
          (decisión de negocio, no la automatiza el CRM).
        </p>

        {/* Clientes encartados y sus variedades */}
        <div>
          <div className="mb-1.5 flex items-center gap-1.5 text-sm font-medium">
            Clientes encartados{" "}
            {clientesEncartados.length > 0 && (
              <Badge variant="outline" className="font-normal">{clientesEncartados.length}</Badge>
            )}
          </div>
          {clientesEncartados.length === 0 ? (
            <p className="rounded-md border border-dashed p-3 text-center text-sm text-muted-foreground">
              Aún no hay clientes con Bogle colocado.
            </p>
          ) : (
            <>
              <ul className="divide-y rounded-md border">
                {clientesEncartados.map((c) => (
                  <li key={c.key} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3 py-2 text-sm">
                    <p className="min-w-0 truncate font-medium">
                      #{c.num} {c.name} <span className="font-normal text-muted-foreground">· {c.rep}</span>
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {c.items.map((p) => (
                        <Badge
                          key={p.id}
                          className={
                            p.estado === "validado"
                              ? "whitespace-nowrap border"
                              : "whitespace-nowrap border border-amber-300 bg-amber-50 text-amber-800"
                          }
                          style={p.estado === "validado" ? { background: "#F5EDDD", color: "#8A6D3B", borderColor: ORO } : undefined}
                          title={p.estado === "validado" ? "Validado" : "Pendiente de validación"}
                        >
                          {variedad(p)}
                        </Badge>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-xs text-muted-foreground">
                Dorado = validado · Ámbar = pendiente de validación. Cada variedad cuenta como un encarte.
              </p>
            </>
          )}
        </div>

        {/* Cola de validación */}
        <div>
          <div className="mb-1.5 flex items-center gap-1.5 text-sm font-medium">
            Cola de validación {pendientes.length > 0 && <Badge className="bg-amber-100 text-amber-800">{pendientes.length}</Badge>}
          </div>
          {pendientes.length === 0 ? (
            <p className="rounded-md border border-dashed p-3 text-center text-sm text-muted-foreground">Sin encartes pendientes. ✓</p>
          ) : (
            <ul className="divide-y rounded-md border">
              {pendientes.map((p) => {
                const rep = race.find((r) => r.rep_id === p.rep_id);
                return (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        #{p.client_number} {p.client_name} <span className="font-normal text-muted-foreground">· {rep?.rep_name}</span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {p.producto ? `${p.producto} · ` : ""}{monthLabel(p.period)} {p.period.slice(0, 4)} ·{" "}
                        {program.require_paid ? "cobrado el" : "factura del"} {p.fecha_deteccion}
                        {p.estado === "en_revision" && " · EN REVISIÓN"}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {p.evidencia_url ? (
                        <a href={p.evidencia_url} target="_blank" rel="noreferrer" className="text-xs underline">
                          ver evidencia
                        </a>
                      ) : (
                        <span className="text-xs text-muted-foreground">sin evidencia</span>
                      )}
                      <Button size="sm" disabled={busy === p.id} onClick={() => resolver(p, "validado")}>
                        <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Validar
                      </Button>
                      <Button size="sm" variant="outline" disabled={busy === p.id} onClick={() => resolver(p, "rechazado")}>
                        <XCircle className="mr-1 h-3.5 w-3.5" /> Rechazar
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
