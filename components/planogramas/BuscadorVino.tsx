"use client";

// Buscador global "¿dónde está este vino?": filtra en el cliente sobre el
// índice aplanado de todas las bodegas (posiciones de rack + tarimas). El
// volumen es de cientos de filas, así que no vale la pena un endpoint.

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, MapPin, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { buscar, type Hallazgo } from "@/lib/planogramas-types";

const MAX_RESULTADOS = 40;

export function BuscadorVino({ indice }: { indice: Hallazgo[] }) {
  const [query, setQuery] = useState("");

  const resultados = useMemo(() => buscar(indice, query), [indice, query]);
  const visibles = resultados.slice(0, MAX_RESULTADOS);
  const botellas = resultados.reduce((acc, h) => acc + h.botellas, 0);

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar un vino, varietal, región o añada en todas las bodegas…"
          className="pl-9 pr-9"
          aria-label="Buscar vino en las bodegas"
        />
        {query ? (
          <button
            type="button"
            onClick={() => setQuery("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:bg-muted"
            aria-label="Limpiar búsqueda"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      {query.trim() === "" ? null : resultados.length === 0 ? (
        <p className="rounded-lg border border-dashed bg-card px-4 py-6 text-center text-sm text-muted-foreground">
          Nada acomodado con “{query}”. Ojo: el planograma solo tiene lo que se
          haya capturado en Teravino Map, no el inventario de CONTPAQ.
        </p>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            {resultados.length} ubicación{resultados.length === 1 ? "" : "es"} ·{" "}
            {botellas} botella{botellas === 1 ? "" : "s"}
            {resultados.length > MAX_RESULTADOS ? ` · mostrando las primeras ${MAX_RESULTADOS}` : ""}
          </p>
          <ul className="divide-y rounded-lg border bg-card">
            {visibles.map((h) => (
              <li key={h.id}>
                <Link
                  href={`/planogramas/${h.bodega_id}`}
                  className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 transition-colors hover:bg-muted/50"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{h.vino}</p>
                    <p className="text-xs text-muted-foreground">
                      {[h.anada, h.varietal, h.region, h.pais].filter(Boolean).join(" · ") || "—"}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge variant={h.tipo === "tarima" ? "accent" : "muted"}>
                      <MapPin className="mr-1 h-3 w-3" />
                      {h.bodega_nombre} · {h.ubicacion}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{h.detalle}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
