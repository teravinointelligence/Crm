"use client";

import { useMemo, useState } from "react";
import { Search, Wine as WineIcon, MapPin, Grape } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { parsePricing, WINE_TYPES } from "@/lib/academy";
import { formatCurrency } from "@/lib/utils";
import type { AcademyWine } from "@/types/database";

const ALL = "_all";

const TYPE_BADGE: Record<string, string> = {
  Tinto: "bg-red-100 text-red-800",
  Blanco: "bg-amber-50 text-amber-700",
  Rosado: "bg-pink-100 text-pink-700",
  Espumoso: "bg-yellow-100 text-yellow-800",
  Dulce: "bg-orange-100 text-orange-800",
  Fortificado: "bg-purple-100 text-purple-800",
};

export function StudyCatalogClient({ wines }: { wines: AcademyWine[] }) {
  const [query, setQuery] = useState("");
  const [type, setType] = useState<string>(ALL);
  const [country, setCountry] = useState<string>(ALL);
  const [producer, setProducer] = useState<string>(ALL);

  const countries = useMemo(
    () => Array.from(new Set(wines.map((w) => w.country).filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b)),
    [wines],
  );
  const producers = useMemo(
    () => Array.from(new Set(wines.map((w) => w.producer).filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b)),
    [wines],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return wines.filter((w) => {
      if (type !== ALL && w.type !== type) return false;
      if (country !== ALL && w.country !== country) return false;
      if (producer !== ALL && w.producer !== producer) return false;
      if (q) {
        const hay = [
          w.name,
          w.producer,
          w.region,
          w.country,
          w.vintage,
          (w.grape_varieties ?? []).join(" "),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [wines, query, type, country, producer]);

  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <div className="relative sm:col-span-2 lg:col-span-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar vino, uva, región…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={type} onValueChange={setType}>
          <SelectTrigger>
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos los tipos</SelectItem>
            {WINE_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={country} onValueChange={setCountry}>
          <SelectTrigger>
            <SelectValue placeholder="País" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos los países</SelectItem>
            {countries.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={producer} onValueChange={setProducer}>
          <SelectTrigger>
            <SelectValue placeholder="Bodega" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todas las bodegas</SelectItem>
            {producers.map((p) => (
              <SelectItem key={p} value={p}>
                {p}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <p className="text-xs text-muted-foreground">
        {filtered.length} {filtered.length === 1 ? "vino" : "vinos"}
      </p>

      {filtered.length === 0 ? (
        <EmptyState
          icon={WineIcon}
          title="Sin resultados"
          description="Ajusta los filtros o la búsqueda para ver vinos del portafolio."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((w) => (
            <WineCard key={w.id} wine={w} />
          ))}
        </div>
      )}
    </div>
  );
}

function WineCard({ wine }: { wine: AcademyWine }) {
  const pricing = parsePricing(wine.tasting_notes);
  return (
    <Card className="flex flex-col">
      <CardContent className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="font-display text-base leading-tight">{wine.name}</h3>
            {wine.producer && (
              <p className="truncate text-xs text-muted-foreground">{wine.producer}</p>
            )}
          </div>
          {wine.type && (
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                TYPE_BADGE[wine.type] ?? "bg-muted text-muted-foreground"
              }`}
            >
              {wine.type}
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {(wine.region || wine.country) && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {[wine.region, wine.country].filter(Boolean).join(", ")}
            </span>
          )}
          {wine.vintage && <span>{wine.vintage}</span>}
          {pricing.presentation && <span>{pricing.presentation}</span>}
        </div>

        {wine.grape_varieties && wine.grape_varieties.length > 0 && (
          <div className="flex flex-wrap items-center gap-1">
            <Grape className="h-3 w-3 text-brand-carmesi" />
            {wine.grape_varieties.map((g) => (
              <Badge key={g} variant="muted" className="text-[11px]">
                {g}
              </Badge>
            ))}
          </div>
        )}

        <div className="mt-auto flex items-center justify-between pt-2">
          {pricing.agotado ? (
            <Badge variant="danger">Agotado</Badge>
          ) : pricing.cIva != null ? (
            <span className="text-sm font-semibold text-brand-carmesi">
              {formatCurrency(pricing.cIva)}
              <span className="ml-1 text-[11px] font-normal text-muted-foreground">c/IVA</span>
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">Precio no disponible</span>
          )}
          {pricing.sIva != null && !pricing.agotado && (
            <span className="text-[11px] text-muted-foreground">
              {formatCurrency(pricing.sIva)} s/IVA
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
