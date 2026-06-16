"use client";

// Tablero admin para asignar vendedor a cuentas que no tienen uno. Lista las
// cuentas sin assigned_rep_id; al elegir vendedor en el select se guarda al
// instante (update directo por el supabase client) y la fila desaparece.

import { useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Search, Loader2, CheckCircle2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { TableScroll } from "@/components/ui/table-scroll";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createClient } from "@/lib/supabase/client";

export type CuentaSinVendedor = {
  id: string;
  client_number: string | null;
  business_name: string;
  region: string | null;
  city: string | null;
};

export type RepOption = { id: string; full_name: string };

export function AsignarVendedorBoard({
  cuentas,
  reps,
}: {
  cuentas: CuentaSinVendedor[];
  reps: RepOption[];
}) {
  const supabase = createClient();
  const [query, setQuery] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [assigned, setAssigned] = useState<Map<string, string>>(new Map());

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = cuentas.filter((c) => !assigned.has(c.id));
    if (!q) return rows;
    return rows.filter((c) =>
      [c.business_name, c.client_number, c.region, c.city]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [cuentas, query, assigned]);

  const repName = useMemo(
    () => new Map(reps.map((r) => [r.id, r.full_name])),
    [reps],
  );

  const handleAssign = async (accountId: string, repId: string) => {
    setPendingId(accountId);
    const { error } = await supabase
      .from("accounts")
      .update({ assigned_rep_id: repId })
      .eq("id", accountId);
    setPendingId(null);
    if (error) {
      toast.error("No se pudo asignar el vendedor", { description: error.message });
      return;
    }
    setAssigned((prev) => new Map(prev).set(accountId, repName.get(repId) ?? "vendedor"));
    toast.success(`Asignado a ${repName.get(repId) ?? "vendedor"}`);
  };

  const restantes = cuentas.length - assigned.size;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative max-w-md flex-1 min-w-[200px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nombre, # cliente o región…"
            className="pl-9"
            aria-label="Buscar cuenta"
          />
        </div>
        <span className="text-sm text-muted-foreground">
          {restantes} sin vendedor
          {assigned.size > 0 && ` · ${assigned.size} asignadas`}
        </span>
      </div>

      {assigned.size > 0 && (
        <Card className="border-emerald-200 bg-emerald-50">
          <CardContent className="p-3 text-sm text-emerald-900">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" />
              {assigned.size} cuenta(s) asignada(s) en esta sesión.
            </div>
          </CardContent>
        </Card>
      )}

      {restantes === 0 ? (
        <EmptyState
          title="Todas las cuentas tienen vendedor"
          description="No quedan cuentas sin vendedor asignado."
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="Sin resultados"
          description={`Ninguna cuenta coincide con "${query}".`}
        />
      ) : (
        <TableScroll>
          <table className="min-w-full text-sm">
            <thead className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3 w-20"># Cliente</th>
                <th className="px-4 py-3">Cuenta</th>
                <th className="px-4 py-3">Región</th>
                <th className="px-4 py-3 w-64">Asignar vendedor</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id} className="border-b last:border-b-0 hover:bg-muted/30">
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                    {c.client_number ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/cuentas/${c.id}`}
                      className="font-medium hover:text-brand-carmesi"
                    >
                      {c.business_name}
                    </Link>
                    {c.city && (
                      <div className="text-xs text-muted-foreground">{c.city}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{c.region ?? "—"}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Select
                        disabled={pendingId === c.id}
                        onValueChange={(v) => handleAssign(c.id, v)}
                      >
                        <SelectTrigger className="w-52">
                          <SelectValue placeholder="Elegir vendedor…" />
                        </SelectTrigger>
                        <SelectContent>
                          {reps.map((r) => (
                            <SelectItem key={r.id} value={r.id}>
                              {r.full_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {pendingId === c.id && (
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      )}
    </div>
  );
}
