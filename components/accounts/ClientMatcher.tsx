"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Check, EyeOff, Search, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/client";

type Pair = {
  id: number;
  num_cliente: string;
  nombre_comercial: string;
  razon_social: string | null;
  vendedor: string | null;
  locacion: string | null;
};
type AccountLite = {
  id: string;
  business_name: string;
  region: string | null;
  fiscal_name: string | null;
  client_number: string | null;
  status: string | null;
  sales_reps: { full_name: string | null } | null;
};
type RepLite = { id: string; full_name: string };

const norm = (s: string | null | undefined) =>
  (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();

const CRM_REGIONS = ["Los Cabos", "La Paz", "Todos Santos", "Tijuana", "Puerto Vallarta", "Nayarit"] as const;

/** Mapea la locación del CSV (SJD, CSL, LAP, VALLARTA…) a una región válida del CRM. */
function mapLocacion(loc: string | null): string | null {
  const l = norm(loc);
  if (!l) return null;
  if (/(sjd|csl|cabo|pescadero|cerritos)/.test(l)) return "Los Cabos";
  if (/(todos santos|^ts$|\bts\b)/.test(l)) return "Todos Santos";
  if (/(lap|la paz|ventana|triunfo)/.test(l)) return "La Paz";
  if (/(tij|tijuana|ensenada|mexicali)/.test(l)) return "Tijuana";
  if (/(vallarta|nayarit|punta mita|pv)/.test(l)) return l.includes("nayarit") ? "Nayarit" : "Puerto Vallarta";
  return null;
}

function bigrams(s: string): Map<string, number> {
  const out = new Map<string, number>();
  const t = ` ${s} `;
  for (let i = 0; i < t.length - 1; i++) {
    const g = t.slice(i, i + 2);
    out.set(g, (out.get(g) ?? 0) + 1);
  }
  return out;
}

function dice(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const ba = bigrams(a);
  const bb = bigrams(b);
  let inter = 0;
  let sumA = 0;
  let sumB = 0;
  for (const v of ba.values()) sumA += v;
  for (const v of bb.values()) sumB += v;
  for (const [g, v] of ba) {
    const w = bb.get(g);
    if (w) inter += Math.min(v, w);
  }
  if (!sumA || !sumB) return 0;
  return (2 * inter) / (sumA + sumB);
}

export function ClientMatcher({
  pairs,
  accounts,
  reps,
  totalPairs,
}: {
  pairs: Pair[];
  accounts: AccountLite[];
  reps: RepLite[];
  totalPairs: number;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [pending, startTransition] = useTransition();
  const [resolved, setResolved] = useState<Set<number>>(new Set());
  const [searchQueries, setSearchQueries] = useState<Record<number, string>>({});
  const [activePair, setActivePair] = useState<number | null>(null);

  // Resuelve el vendedor del CSV (ej. "YAMILE", "ANDRA") a un sales_rep por
  // coincidencia de primer nombre. Devuelve { id, full_name } o null.
  const resolveRep = (vendedorCsv: string | null): RepLite | null => {
    const v = norm(vendedorCsv);
    if (!v) return null;
    for (const r of reps) {
      const full = norm(r.full_name);
      const first = full.split(" ")[0];
      if (v === full || v === first || v.includes(first) || first.includes(v)) return r;
    }
    return null;
  };

  const remaining = useMemo(
    () => pairs.filter((p) => !resolved.has(p.id)),
    [pairs, resolved],
  );

  const suggestionsByPair = useMemo(() => {
    const m = new Map<number, Array<AccountLite & { sim: number }>>();
    for (const p of remaining) {
      const target = norm(p.nombre_comercial);
      const ranked = accounts
        .map((a) => ({ ...a, sim: dice(target, norm(a.business_name)) }))
        .filter((x) => x.sim >= 0.2)
        .sort((a, b) => b.sim - a.sim)
        .slice(0, 5);
      m.set(p.id, ranked);
    }
    return m;
  }, [remaining, accounts]);

  const assign = (pair: Pair, account: AccountLite) => {
    startTransition(async () => {
      const rep = resolveRep(pair.vendedor);
      const update: Record<string, unknown> = { client_number: pair.num_cliente };
      // Asignamos vendedor del CSV solo si lo resolvimos y la cuenta no tiene uno
      // (no pisamos una asignación existente sin intención).
      const accountHasRep = !!account.sales_reps?.full_name;
      if (rep && !accountHasRep) update.assigned_rep_id = rep.id;
      const { error } = await supabase.from("accounts").update(update).eq("id", account.id);
      if (error) {
        toast.error("No pude asignar", { description: error.message });
        return;
      }
      toast.success(
        `# ${pair.num_cliente} asignado` + (rep && !accountHasRep ? ` · vendedor ${rep.full_name}` : ""),
      );
      setResolved((s) => new Set(s).add(pair.id));
      router.refresh();
    });
  };

  const crearCuenta = (pair: Pair) => {
    startTransition(async () => {
      const rep = resolveRep(pair.vendedor);
      const region = mapLocacion(pair.locacion);
      const { error } = await supabase.from("accounts").insert({
        business_name: pair.nombre_comercial.trim(),
        client_number: pair.num_cliente,
        fiscal_name: pair.razon_social?.trim() || null,
        region: region && CRM_REGIONS.includes(region as (typeof CRM_REGIONS)[number]) ? region : null,
        assigned_rep_id: rep?.id ?? null,
        status: "prospecto",
      });
      if (error) {
        toast.error("No pude crear la cuenta", { description: error.message });
        return;
      }
      toast.success(
        `Cuenta "${pair.nombre_comercial}" creada (# ${pair.num_cliente})` + (rep ? ` · ${rep.full_name}` : " · sin vendedor"),
      );
      setResolved((s) => new Set(s).add(pair.id));
      router.refresh();
    });
  };

  const ignore = (pair: Pair) => {
    startTransition(async () => {
      const { error } = await supabase
        .from("clientes_relacion_raw")
        .update({ ignored: true })
        .eq("id", pair.id);
      if (error) {
        toast.error("No pude ocultar", { description: error.message });
        return;
      }
      toast.success("Fila ocultada");
      setResolved((s) => new Set(s).add(pair.id));
      router.refresh();
    });
  };

  if (remaining.length === 0) {
    return (
      <Card>
        <CardContent className="space-y-2 p-6 text-center">
          <p className="font-display text-xl">Todo enlazado</p>
          <p className="text-sm text-muted-foreground">
            No quedan pares pendientes de la relación de clientes ({totalPairs} totales).
          </p>
          <Button asChild variant="outline" className="mt-2">
            <Link href="/cuentas">Volver a cuentas</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Pendientes: <strong>{remaining.length}</strong> de {totalPairs}
      </p>

      {remaining.map((p) => {
        const suggestions = suggestionsByPair.get(p.id) ?? [];
        const q = (searchQueries[p.id] ?? "").trim().toLowerCase();
        const searchResults = q
          ? accounts
              .filter((a) =>
                [a.business_name, a.fiscal_name, a.region].some((x) =>
                  norm(x ?? "").includes(norm(q)),
                ),
              )
              .slice(0, 8)
          : [];
        return (
          <Card key={p.id}>
            <CardContent className="space-y-3 p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <h3 className="font-display text-lg">
                    <span className="font-mono text-brand-carmesi">#{p.num_cliente}</span> · {p.nombre_comercial}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {[p.razon_social, p.vendedor, p.locacion].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={() => crearCuenta(p)}
                    title="Crear una cuenta nueva con estos datos"
                  >
                    <UserPlus className="mr-1 h-3.5 w-3.5" /> Crear cuenta
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={pending}
                    onClick={() => ignore(p)}
                    title="No es una cuenta real"
                  >
                    <EyeOff className="mr-1 h-3.5 w-3.5" /> No aplica
                  </Button>
                </div>
              </div>

              {suggestions.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin coincidencias automáticas. Busca abajo.</p>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {suggestions.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      disabled={pending}
                      onClick={() => assign(p, s)}
                      className="rounded-md border bg-card p-2 text-left text-sm transition hover:border-brand-carmesi disabled:opacity-50"
                    >
                      <div className="flex items-center gap-1.5">
                        <Check className="h-3.5 w-3.5 text-brand-carmesi opacity-60" />
                        <span className="font-medium">{s.business_name}</span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {[
                          s.region,
                          s.sales_reps?.full_name,
                          s.client_number ? `actual: #${s.client_number}` : null,
                          `${Math.round(s.sim * 100)}%`,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </div>
                    </button>
                  ))}
                </div>
              )}

              <div className="space-y-2">
                {activePair === p.id ? (
                  <div className="space-y-2">
                    <div className="relative">
                      <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        autoFocus
                        placeholder="Buscar otra cuenta…"
                        value={searchQueries[p.id] ?? ""}
                        onChange={(e) =>
                          setSearchQueries((s) => ({ ...s, [p.id]: e.target.value }))
                        }
                        className="pl-9"
                      />
                    </div>
                    {searchResults.length > 0 && (
                      <div className="grid gap-1.5 sm:grid-cols-2">
                        {searchResults.map((a) => (
                          <button
                            key={a.id}
                            type="button"
                            disabled={pending}
                            onClick={() => assign(p, a)}
                            className="rounded-md border bg-card p-2 text-left text-sm hover:border-brand-carmesi disabled:opacity-50"
                          >
                            <span className="font-medium">{a.business_name}</span>
                            <span className="ml-2 text-xs text-muted-foreground">
                              {[a.region, a.client_number ? `#${a.client_number}` : null]
                                .filter(Boolean)
                                .join(" · ")}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setActivePair(p.id)}
                  >
                    <Search className="mr-1 h-3.5 w-3.5" /> Buscar otra cuenta…
                  </Button>
                )}
                <Badge variant="muted" className="text-[10px]">
                  vendedor csv: {p.vendedor ?? "—"}
                  {resolveRep(p.vendedor) ? ` → ${resolveRep(p.vendedor)!.full_name}` : " (sin match en CRM)"}
                  {" · "}locación: {p.locacion ?? "—"}
                  {mapLocacion(p.locacion) ? ` → ${mapLocacion(p.locacion)}` : ""}
                </Badge>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
