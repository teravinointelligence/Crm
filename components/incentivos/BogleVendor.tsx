"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Clock, Plane, Trophy, Users } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  PLACEMENT_ESTADO_LABEL,
  daysRemaining,
  monthLabel,
  type IncentivePlacement,
  type IncentiveProgram,
  type IncentiveRaceRow,
} from "@/lib/incentivos";

const ORO = "#c9a96e";

function EstadoBadge({ estado }: { estado: IncentivePlacement["estado"] }) {
  const cls =
    estado === "validado"
      ? "bg-emerald-100 text-emerald-800"
      : estado === "rechazado"
        ? "bg-red-100 text-red-700"
        : "bg-amber-100 text-amber-800";
  return <Badge className={`whitespace-nowrap ${cls}`}>{PLACEMENT_ESTADO_LABEL[estado]}</Badge>;
}

export function BogleVendor({
  program,
  placements,
  race,
  repId,
  isSelf,
}: {
  program: IncentiveProgram;
  placements: IncentivePlacement[];
  race: IncentiveRaceRow[];
  repId: string;
  isSelf: boolean;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState<string | null>(null);

  const meta = program.meta_encartes ?? 10;
  const maxGanadores = program.max_ganadores ?? 2;
  const mios = placements.filter((p) => p.rep_id === repId && p.estado !== "rechazado");
  const validados = mios.filter((p) => p.estado === "validado").length;
  const pendientes = mios.filter((p) => p.estado === "pendiente" || p.estado === "en_revision").length;

  const ganadores = race.filter((r) => r.es_ganador);
  const cuposTomados = ganadores.length;
  const cuposLibres = Math.max(0, maxGanadores - cuposTomados);
  const cerrado = program.estado === "cerrado" || cuposLibres === 0;
  const yo = race.find((r) => r.rep_id === repId);
  const soyGanador = yo?.es_ganador ?? false;
  const llegueSinCupo = (yo?.validados ?? 0) >= meta && !soyGanador;
  const dias = daysRemaining(program.end_date, new Date());

  const subirEvidencia = async (placementId: string, file: File) => {
    setSubiendo(placementId);
    const fd = new FormData();
    fd.append("evidencia", file);
    const res = await fetch(`/api/incentivos/placements/${placementId}/evidencia`, {
      method: "POST",
      body: fd,
    });
    setSubiendo(null);
    if (!res.ok) {
      const j = await res.json().catch(() => null);
      toast.error("No se pudo subir la evidencia", { description: j?.error });
      return;
    }
    toast.success("Evidencia subida");
    router.refresh();
  };

  return (
    <Card className="overflow-hidden border-2" style={{ borderColor: ORO }}>
      {/* Franja dorada: visualmente distinta a la card GB (crimson) */}
      <div className="h-1.5 w-full" style={{ background: `linear-gradient(90deg,${ORO},#8A6D3B)` }} />
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 font-display text-xl">
              <Plane className="h-5 w-5" style={{ color: ORO }} /> Viaje a la Bodega Bogle · California
            </CardTitle>
            <CardDescription>
              Los primeros {maxGanadores} vendedores con {meta} encartes ganan el viaje (vuelos, hospedaje y
              experiencia en bodega, todo pagado por {program.provider}). Periodo:{" "}
              {monthLabel(program.start_date)}–{monthLabel(program.end_date)} {program.end_date.slice(0, 4)}.
            </CardDescription>
          </div>
          <Badge variant="outline" className="gap-1 whitespace-nowrap">
            <Clock className="h-3.5 w-3.5" /> {dias} días restantes
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Celebración / estado final */}
        {isSelf && soyGanador && (
          <div className="rounded-lg border p-3 text-center" style={{ borderColor: ORO, background: "#F5EDDD" }}>
            <Trophy className="mx-auto h-6 w-6" style={{ color: ORO }} />
            <p className="font-display text-xl" style={{ color: "#8A6D3B" }}>
              ¡Calificaste al viaje a Bogle! 🛫
            </p>
            <p className="text-xs text-muted-foreground">Dirección confirmará contigo los detalles del viaje (visa vigente requerida).</p>
          </div>
        )}
        {isSelf && llegueSinCupo && (
          <div className="rounded-lg border bg-muted p-3 text-center text-sm">
            Llegaste a {meta} encartes, pero los {maxGanadores} cupos ya estaban tomados. Gran trabajo igual —
            tu esfuerzo cuenta para Gerard Bertrand y los programas que vienen.
          </div>
        )}

        {/* Contador + barra de 10 segmentos */}
        <div>
          <div className="flex items-end justify-between">
            <p>
              <span className="font-display text-5xl" style={{ color: "#8A6D3B" }}>{validados}</span>
              <span className="text-xl text-muted-foreground"> / {meta} encartes</span>
            </p>
            <p className="text-xs text-muted-foreground">
              {validados} validados · {pendientes} pendientes de validación
            </p>
          </div>
          <div className="mt-2 flex gap-1">
            {Array.from({ length: meta }, (_, i) => {
              const validado = i < validados;
              const pendiente = !validado && i < validados + pendientes;
              return (
                <div
                  key={i}
                  className="h-3 flex-1 rounded-sm border"
                  style={
                    validado
                      ? { background: ORO, borderColor: ORO }
                      : pendiente
                        ? { borderColor: ORO, background: "transparent" }
                        : { borderColor: "#E5E2DA", background: "transparent" }
                  }
                  title={validado ? "Validado" : pendiente ? "Pendiente de validación" : ""}
                />
              );
            })}
          </div>
        </div>

        {/* Carrera: cupos + mini-leaderboard */}
        <div className="rounded-lg border p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="flex items-center gap-1.5 text-sm font-medium">
              <Users className="h-4 w-4 text-muted-foreground" /> La carrera
            </p>
            {cerrado ? (
              <Badge className="bg-red-100 text-red-700">
                Cupos agotados{ganadores.length ? ` · Ganadores: ${ganadores.map((g) => g.rep_name.split(" ")[0]).join(" y ")}` : ""}
              </Badge>
            ) : (
              <Badge className="border" style={{ background: "#F5EDDD", color: "#8A6D3B", borderColor: ORO }}>
                {cuposLibres === maxGanadores
                  ? `${cuposLibres} cupos disponibles`
                  : `${cuposLibres} cupo${cuposLibres === 1 ? "" : "s"} · ${ganadores.map((g) => g.rep_name.split(" ")[0]).join(", ")} ya calificó`}
              </Badge>
            )}
          </div>
          <div className="space-y-1">
            {race.map((r) => (
              <div key={r.rep_id} className="flex items-center gap-2 text-sm">
                <span className={`w-28 truncate ${r.rep_id === repId ? "font-semibold" : ""}`}>
                  {r.rep_name.split(" ")[0]}{r.rep_id === repId ? " (tú)" : ""}
                </span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${Math.min(100, (r.validados / meta) * 100)}%`, background: ORO }}
                  />
                </div>
                <span className="w-14 text-right text-xs text-muted-foreground">
                  {r.validados}/{meta}
                  {r.es_ganador ? " 🏆" : ""}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Mis encartes */}
        <div>
          <p className="mb-1.5 text-sm font-medium">Mis encartes</p>
          {mios.length === 0 ? (
            <p className="rounded-md border border-dashed p-3 text-center text-sm text-muted-foreground">
              Aún no tienes encartes. Coloca Bogle con un cliente y factúrale — la detección es automática.
            </p>
          ) : (
            <ul className="divide-y rounded-md border">
              {mios.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      #{p.client_number} {p.client_name}
                      {p.producto && <span className="font-normal text-muted-foreground"> · {p.producto}</span>}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Primera venta: {monthLabel(p.period)} {p.period.slice(0, 4)} ·{" "}
                      {program.require_paid ? "cobrada el" : "factura del"} {p.fecha_deteccion}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {p.evidencia_url && (
                      <a href={p.evidencia_url} target="_blank" rel="noreferrer" className="text-xs underline text-muted-foreground">
                        evidencia
                      </a>
                    )}
                    <EstadoBadge estado={p.estado} />
                    {isSelf && (p.estado === "pendiente" || p.estado === "en_revision") && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={subiendo === p.id}
                        onClick={() => {
                          fileRef.current?.setAttribute("data-placement", p.id);
                          fileRef.current?.click();
                        }}
                      >
                        <Camera className="mr-1 h-3.5 w-3.5" /> {p.evidencia_url ? "Reemplazar" : "Evidencia"}
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {isSelf && (
            <input
              ref={fileRef}
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                const pid = fileRef.current?.getAttribute("data-placement");
                if (f && pid) void subirEvidencia(pid, f);
                e.target.value = "";
              }}
            />
          )}
        </div>

        {/* Avisos fijos */}
        <div className="space-y-1 text-xs text-muted-foreground">
          <p>
            · Cuentan clientes <span className="font-medium text-foreground">nuevos y existentes</span>: lo que importa es que
            compren Bogle entre junio y septiembre 2026 —{" "}
            {program.require_paid ? "facturado y cobrado" : "con la venta facturada basta, no hace falta esperar el cobro"}.
            Cada <span className="font-medium text-foreground">variedad</span> colocada con un cliente cuenta como un encarte
            (2 variedades con el mismo cliente = 2 encartes); la misma variedad con el mismo cliente cuenta una sola vez.
          </p>
          <p>
            · <span className="font-medium text-foreground">Requisito para viajar: visa estadounidense vigente.</span> Si no la
            tienes, inicia el trámite hoy — no afecta tu conteo, pero sin visa no hay viaje.
          </p>
          <p>
            · El orden de llegada lo define{" "}
            {program.require_paid
              ? `la fecha de cobro de la factura que completa tu encarte #${meta}`
              : `la fecha de la primera factura del mes que completa tu encarte #${meta}`}
            ; la validación de dirección confirma cada encarte pero no altera el orden.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
