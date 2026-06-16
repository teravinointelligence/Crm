"use client";

// Sugerencias de actividades del día, generadas por IA según lo que le falta al
// vendedor en su cartera (cuentas sin contactos, sin actividad, prospectos por
// visitar, clientes que cayeron). Se genera on-demand vía /api/dashboard/
// sugerencias y se cachea por día en sessionStorage para no llamar al LLM en
// cada navegación. Cada renglón enlaza a la acción (agendar visita / contactos).
// Si la cartera no tiene pendientes, la tarjeta no se muestra.

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Sparkles,
  Loader2,
  CalendarPlus,
  UserPlus,
  TrendingDown,
  MapPin,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type Sugerencia = {
  account_id: string;
  business_name: string;
  region: string | null;
  kind: string;
  titulo: string;
  motivo: string;
  href: string;
};

type BadgeVariant = "danger" | "accent" | "warning" | "muted";

const KIND_META: Record<string, { icon: React.ComponentType<{ className?: string }>; label: string; variant: BadgeVariant }> = {
  churn: { icon: TrendingDown, label: "Reactivar", variant: "danger" },
  prospecto: { icon: MapPin, label: "Prospecto", variant: "accent" },
  sin_actividad: { icon: CalendarPlus, label: "Sin actividad", variant: "warning" },
  sin_contactos: { icon: UserPlus, label: "Falta contacto", variant: "muted" },
};

const CACHE_KEY = "sugerencias-ia";

export function SugerenciasIA() {
  const [items, setItems] = useState<Sugerencia[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async (force: boolean) => {
    setLoading(true);
    setError(null);
    const today = new Date().toISOString().slice(0, 10);
    if (!force) {
      try {
        const cached = JSON.parse(sessionStorage.getItem(CACHE_KEY) || "null");
        if (cached && cached.date === today) {
          setItems(cached.items as Sugerencia[]);
          setLoading(false);
          return;
        }
      } catch {
        /* cache corrupto: se ignora y se regenera */
      }
    }
    try {
      const res = await fetch("/api/dashboard/sugerencias", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudieron generar las sugerencias.");
      const sugerencias = (data.sugerencias ?? []) as Sugerencia[];
      setItems(sugerencias);
      try {
        sessionStorage.setItem(CACHE_KEY, JSON.stringify({ date: today, items: sugerencias }));
      } catch {
        /* sessionStorage lleno/no disponible: no es crítico */
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al generar las sugerencias.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sin pendientes (cartera al día): no estorbamos el dashboard.
  if (!loading && !error && items && items.length === 0) return null;

  return (
    <Card className="border-brand-carmesi/30 bg-brand-carmesi/5">
      <CardContent className="space-y-3 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <Sparkles className="h-4 w-4 text-brand-carmesi" />
          <h2 className="font-display text-lg">Sugerencias de hoy</h2>
          <span className="hidden text-xs text-muted-foreground sm:inline">
            · generadas por IA según lo que falta en tu cartera
          </span>
          {!loading && (
            <button
              onClick={() => load(true)}
              className="ml-auto text-xs text-muted-foreground hover:text-foreground"
            >
              ↻ Actualizar
            </button>
          )}
        </div>

        {loading ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Analizando tu cartera…
          </div>
        ) : error ? (
          <p className="text-sm text-muted-foreground">{error}</p>
        ) : (
          <ul className="space-y-2">
            {items!.map((s) => {
              const meta = KIND_META[s.kind] ?? KIND_META.sin_actividad;
              const Icon = meta.icon;
              return (
                <li key={s.account_id}>
                  <Link
                    href={s.href}
                    className="flex items-start gap-3 rounded-md border bg-background p-3 transition-colors hover:border-brand-carmesi"
                  >
                    <span className="mt-0.5 shrink-0 rounded-full bg-brand-carmesi/10 p-1.5 text-brand-carmesi">
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{s.titulo}</span>
                        <Badge variant={meta.variant}>{meta.label}</Badge>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {s.business_name}
                        {s.region ? ` · ${s.region}` : ""}
                        {s.motivo ? ` — ${s.motivo}` : ""}
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
