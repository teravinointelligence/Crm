"use client";

// Plano de una bodega: rejilla de racks (botellas sueltas) y filas de tarimas
// (cajas). Es SOLO CONSULTA — al tocar un hueco se abre un panel con lo que
// hay ahí; para mover o capturar se va a la app de Base44.
//
// El selector de rack vive en el cliente porque cambiar de rack no debe pegarle
// al servidor: ya tenemos todas las posiciones de la bodega en memoria.

import { useMemo, useState } from "react";
import { Boxes, Wine, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  botellasDeCaja,
  porCelda,
  porTarima,
  rackOf,
  type PlanoBodega,
  type PlanoCaja,
  type PlanoPosicion,
} from "@/lib/planogramas-types";

type Seleccion =
  | { tipo: "celda"; rack: number; fila: number; columna: number; items: PlanoPosicion[] }
  | { tipo: "tarima"; fila: number; tarima: number; items: PlanoCaja[] }
  | null;

export function BodegaPlano({
  bodega,
  posiciones,
  cajas,
  accent,
}: {
  bodega: PlanoBodega;
  posiciones: PlanoPosicion[];
  cajas: PlanoCaja[];
  accent: string;
}) {
  const racks = Math.max(1, Number(bodega.numero_racks) || 1);
  const filas = Math.max(1, Number(bodega.filas) || 1);
  const columnas = Math.max(1, Number(bodega.columnas) || 1);
  const filasTarimas = Math.max(0, Number(bodega.filas_tarimas) || 0);
  const tarimasPorFila = Math.max(0, Number(bodega.tarimas_por_fila) || 0);

  const [rackActivo, setRackActivo] = useState(1);
  const [seleccion, setSeleccion] = useState<Seleccion>(null);

  const celdas = useMemo(() => porCelda(posiciones), [posiciones]);
  const tarimas = useMemo(() => porTarima(cajas), [cajas]);

  // Botellas por rack, para marcar en el selector cuáles están vacíos.
  const botellasPorRack = useMemo(() => {
    const m = new Map<number, number>();
    for (const p of posiciones) {
      const r = rackOf(p);
      m.set(r, (m.get(r) ?? 0) + (Number(p.cantidad) || 0));
    }
    return m;
  }, [posiciones]);

  return (
    <div className="space-y-6">
      {/* Selector de rack */}
      {racks > 1 ? (
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: racks }, (_, i) => i + 1).map((r) => {
            const activo = r === rackActivo;
            const vacio = (botellasPorRack.get(r) ?? 0) === 0;
            return (
              <button
                key={r}
                type="button"
                onClick={() => {
                  setRackActivo(r);
                  setSeleccion(null);
                }}
                className={`rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${
                  activo ? "text-white" : "bg-card hover:bg-muted/50"
                } ${vacio && !activo ? "text-muted-foreground" : ""}`}
                style={activo ? { backgroundColor: accent, borderColor: accent } : undefined}
                aria-pressed={activo}
              >
                Rack {r}
                {vacio ? " · vacío" : ""}
              </button>
            );
          })}
        </div>
      ) : null}

      {/* Rejilla del rack activo */}
      <section className="space-y-2">
        <h2 className="flex items-center gap-2 font-display text-lg">
          <Wine className="h-4 w-4" />
          Rack {rackActivo}
          <span className="text-sm font-normal text-muted-foreground">
            {filas} fila{filas === 1 ? "" : "s"} × {columnas} columna{columnas === 1 ? "" : "s"}
          </span>
        </h2>
        <div className="overflow-x-auto pb-1">
          <div
            className="grid min-w-fit gap-1.5"
            style={{ gridTemplateColumns: `repeat(${columnas}, minmax(4.5rem, 1fr))` }}
          >
            {Array.from({ length: filas }, (_, fi) => fi + 1).flatMap((fila) =>
              Array.from({ length: columnas }, (_, ci) => ci + 1).map((columna) => {
                const items = celdas.get(`${rackActivo}-${fila}-${columna}`) ?? [];
                const botellas = items.reduce((acc, p) => acc + (Number(p.cantidad) || 0), 0);
                const ocupada = items.length > 0;
                const activa =
                  seleccion?.tipo === "celda" &&
                  seleccion.rack === rackActivo &&
                  seleccion.fila === fila &&
                  seleccion.columna === columna;
                return (
                  <button
                    key={`${fila}-${columna}`}
                    type="button"
                    onClick={() =>
                      setSeleccion(
                        ocupada ? { tipo: "celda", rack: rackActivo, fila, columna, items } : null,
                      )
                    }
                    disabled={!ocupada}
                    className={`flex h-20 flex-col justify-between rounded-lg border p-1.5 text-left transition-all ${
                      ocupada ? "hover:scale-[1.02]" : "border-dashed bg-muted/30"
                    } ${activa ? "ring-2 ring-offset-1" : ""}`}
                    style={{
                      backgroundColor: ocupada ? `${accent}1f` : undefined,
                      borderColor: ocupada ? accent : undefined,
                      ...(activa ? ({ "--tw-ring-color": accent } as React.CSSProperties) : {}),
                    }}
                    title={
                      ocupada
                        ? items.map((p) => `${p.vino} (${p.cantidad ?? 0})`).join("\n")
                        : `F${fila} C${columna} · vacía`
                    }
                  >
                    <span className="text-[10px] font-medium text-muted-foreground">
                      F{fila} C{columna}
                    </span>
                    {ocupada ? (
                      <>
                        <span className="line-clamp-2 text-[10px] font-medium leading-tight">
                          {items[0].vino}
                          {items.length > 1 ? ` +${items.length - 1}` : ""}
                        </span>
                        <span className="text-[10px] text-muted-foreground">{botellas} bot.</span>
                      </>
                    ) : null}
                  </button>
                );
              }),
            )}
          </div>
        </div>
      </section>

      {/* Tarimas */}
      {filasTarimas > 0 && tarimasPorFila > 0 ? (
        <section className="space-y-2">
          <h2 className="flex items-center gap-2 font-display text-lg">
            <Boxes className="h-4 w-4" />
            Tarimas
            <span className="text-sm font-normal text-muted-foreground">
              {filasTarimas} fila{filasTarimas === 1 ? "" : "s"} × {tarimasPorFila} por fila
            </span>
          </h2>
          <div className="overflow-x-auto pb-1">
            <div
              className="grid min-w-fit gap-1.5"
              style={{ gridTemplateColumns: `repeat(${tarimasPorFila}, minmax(5.5rem, 1fr))` }}
            >
              {Array.from({ length: filasTarimas }, (_, fi) => fi + 1).flatMap((fila) =>
                Array.from({ length: tarimasPorFila }, (_, ti) => ti + 1).map((tarima) => {
                  const items = tarimas.get(`${fila}-${tarima}`) ?? [];
                  const botellas = items.reduce((acc, c) => acc + botellasDeCaja(c), 0);
                  const numCajas = items.reduce((acc, c) => acc + (Number(c.numero_cajas) || 0), 0);
                  const ocupada = items.length > 0;
                  const activa =
                    seleccion?.tipo === "tarima" &&
                    seleccion.fila === fila &&
                    seleccion.tarima === tarima;
                  return (
                    <button
                      key={`${fila}-${tarima}`}
                      type="button"
                      onClick={() =>
                        setSeleccion(ocupada ? { tipo: "tarima", fila, tarima, items } : null)
                      }
                      disabled={!ocupada}
                      className={`flex h-20 flex-col justify-between rounded-lg border p-1.5 text-left transition-all ${
                        ocupada ? "hover:scale-[1.02]" : "border-dashed bg-muted/30"
                      } ${activa ? "ring-2 ring-offset-1" : ""}`}
                      style={{
                        backgroundColor: ocupada ? `${accent}1f` : undefined,
                        borderColor: ocupada ? accent : undefined,
                        ...(activa ? ({ "--tw-ring-color": accent } as React.CSSProperties) : {}),
                      }}
                      title={
                        ocupada
                          ? items.map((c) => `${c.vino} (${c.numero_cajas ?? 0} cajas)`).join("\n")
                          : `F${fila} T${tarima} · vacía`
                      }
                    >
                      <span className="text-[10px] font-medium text-muted-foreground">
                        F{fila} T{tarima}
                      </span>
                      {ocupada ? (
                        <>
                          <span className="line-clamp-2 text-[10px] font-medium leading-tight">
                            {items[0].vino}
                            {items.length > 1 ? ` +${items.length - 1}` : ""}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            {numCajas} cajas · {botellas} bot.
                          </span>
                        </>
                      ) : null}
                    </button>
                  );
                }),
              )}
            </div>
          </div>
        </section>
      ) : null}

      {/* Detalle del hueco seleccionado */}
      {seleccion ? (
        <div className="rounded-lg border bg-card">
          <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
            <h3 className="font-display text-base">
              {seleccion.tipo === "celda"
                ? `Rack ${seleccion.rack} · F${seleccion.fila} C${seleccion.columna}`
                : `Tarimas · F${seleccion.fila} T${seleccion.tarima}`}
            </h3>
            <button
              type="button"
              onClick={() => setSeleccion(null)}
              className="rounded-full p-1 text-muted-foreground hover:bg-muted"
              aria-label="Cerrar detalle"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <ul className="divide-y">
            {seleccion.tipo === "celda"
              ? seleccion.items.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-start justify-between gap-2 px-4 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{p.vino}</p>
                      <p className="text-xs text-muted-foreground">
                        {[p.anada, p.varietal, p.bodega_origen, p.region, p.pais]
                          .filter(Boolean)
                          .join(" · ") || "—"}
                      </p>
                      {p.notas ? (
                        <p className="mt-1 text-xs italic text-muted-foreground">{p.notas}</p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge variant="muted">{p.presentacion ?? "750ml"}</Badge>
                      <Badge variant="accent">{Number(p.cantidad) || 0} bot.</Badge>
                    </div>
                  </li>
                ))
              : seleccion.items.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-start justify-between gap-2 px-4 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{c.vino}</p>
                      <p className="text-xs text-muted-foreground">
                        {[c.anada, c.varietal, c.bodega_origen, c.region, c.pais]
                          .filter(Boolean)
                          .join(" · ") || "—"}
                      </p>
                      {c.notas ? (
                        <p className="mt-1 text-xs italic text-muted-foreground">{c.notas}</p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge variant="muted">{c.presentacion ?? "750ml"}</Badge>
                      <Badge variant="muted">
                        {Number(c.numero_cajas) || 0} × {Number(c.tamano_caja) || 0}
                      </Badge>
                      <Badge variant="accent">{botellasDeCaja(c)} bot.</Badge>
                    </div>
                  </li>
                ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
