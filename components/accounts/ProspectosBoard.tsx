"use client";

// Tablero admin de prospectos agrupados por vendedor: secciones colapsables con
// los prospectos de cada uno (zona, cuándo se registró, quién lo registró,
// última actividad). Buscador en memoria por nombre.

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";

export type ProspectRow = {
  account_id: string;
  business_name: string;
  region: string | null;
  created_at: string | null;
  created_by_name: string | null;
  last_activity_date: string | null;
  days_inactive: number | null;
};

export type ProspectRepGroup = {
  rep_id: string | null;
  rep_name: string;
  prospectos: ProspectRow[];
};

function fecha(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });
}

function actividadLabel(r: ProspectRow): string {
  if (r.days_inactive === null) return "Sin actividad";
  const d = r.days_inactive;
  return d === 0 ? "Hoy" : `Hace ${d} ${d === 1 ? "día" : "días"}`;
}

export function ProspectosBoard({ groups }: { groups: ProspectRepGroup[] }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return groups;
    return groups
      .map((g) => ({
        ...g,
        prospectos: g.prospectos.filter((p) => p.business_name.toLowerCase().includes(q)),
      }))
      .filter((g) => g.prospectos.length > 0);
  }, [groups, query]);

  const toggle = (key: string) => setOpen((s) => ({ ...s, [key]: !s[key] }));

  return (
    <div className="space-y-4">
      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar prospecto por nombre…"
          className="pl-9"
          aria-label="Buscar prospecto"
        />
      </div>

      {filtered.map((g) => {
        const key = g.rep_id ?? "__sin__";
        const isOpen = open[key] ?? query.trim().length > 0;
        return (
          <Card key={key}>
            <CardContent className="p-0">
              <button
                type="button"
                onClick={() => toggle(key)}
                className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-muted/30"
              >
                <span className="flex items-center gap-2 font-medium">
                  {isOpen ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                  {g.rep_name}
                </span>
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                  {g.prospectos.length}
                </span>
              </button>

              {isOpen && (
                <div className="overflow-x-auto border-t">
                  <table className="min-w-full text-sm">
                    <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="px-4 py-2">Prospecto</th>
                        <th className="px-4 py-2">Zona</th>
                        <th className="px-4 py-2">Registrado</th>
                        <th className="px-4 py-2">Por</th>
                        <th className="px-4 py-2">Última actividad</th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.prospectos.map((p) => (
                        <tr key={p.account_id} className="border-b last:border-b-0 hover:bg-muted/20">
                          <td className="px-4 py-2 font-medium">
                            <Link
                              href={`/cuentas/${p.account_id}`}
                              className="hover:text-brand-carmesi"
                            >
                              {p.business_name}
                            </Link>
                          </td>
                          <td className="px-4 py-2 text-muted-foreground">{p.region ?? "—"}</td>
                          <td className="px-4 py-2 text-muted-foreground">{fecha(p.created_at)}</td>
                          <td className="px-4 py-2 text-muted-foreground">{p.created_by_name ?? "—"}</td>
                          <td
                            className={`px-4 py-2 ${
                              p.days_inactive === null || p.days_inactive >= 30
                                ? "text-amber-600"
                                : "text-muted-foreground"
                            }`}
                          >
                            {actividadLabel(p)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
