"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Check, EyeOff, Search } from "lucide-react";
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

const norm = (s: string | null | undefined) =>
  (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();

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
  totalPairs,
}: {
  pairs: Pair[];
  accounts: AccountLite[];
  totalPairs: number;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [pending, startTransition] = useTransition();
  const [resolved, setResolved] = useState<Set<number>>(new Set());
  const [searchQueries, setSearchQueries] = useState<Record<number, string>>({});
  const [activePair, setActivePair] = useState<number | null>(null);

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

  const assign = (pair: Pair, accountId: string) => {
    startTransition(async () => {
      const { error } = await supabase
        .from("accounts")
        .update({ client_number: pair.num_cliente })
        .eq("id", accountId);
      if (error) {
        toast.error("No pude asignar", { description: error.message });
        return;
      }
      toast.success(`# ${pair.num_cliente} asignado`);
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

              {suggestions.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin coincidencias automáticas. Busca abajo.</p>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {suggestions.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      disabled={pending}
                      onClick={() => assign(p, s.id)}
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
                            onClick={() => assign(p, a.id)}
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
                  vendedor csv: {p.vendedor ?? "—"} · locación: {p.locacion ?? "—"}
                </Badge>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
