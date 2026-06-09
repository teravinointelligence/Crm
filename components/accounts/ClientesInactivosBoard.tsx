"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Mail, Loader2, ChevronDown, ChevronRight, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export type InactiveRepGroup = {
  rep_id: string | null;
  rep_name: string;
  rep_email: string | null;
  accounts: {
    account_id: string;
    business_name: string;
    last_activity_date: string | null;
    days_inactive: number | null;
  }[];
};

const DAY_OPTIONS = [15, 30, 45, 60, 90];
const DEFAULT_DAYS = 15;

function lastContactLabel(days: number | null, iso: string | null): string {
  if (days === null) return "Sin actividad registrada";
  const fecha = iso
    ? new Date(iso).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" })
    : "";
  const dias = days === 1 ? "1 día" : `${days} días`;
  return fecha ? `Hace ${dias} · ${fecha}` : `Hace ${dias}`;
}

export function ClientesInactivosBoard({ groups }: { groups: InactiveRepGroup[] }) {
  const [days, setDays] = useState<number>(DEFAULT_DAYS);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState<string | null>(null);
  const [bulk, setBulk] = useState(false);

  // Filtra cada grupo al umbral elegido (nunca = siempre inactivo).
  const filtered = useMemo(() => {
    return groups
      .map((g) => ({
        ...g,
        accounts: g.accounts.filter((a) => a.days_inactive === null || a.days_inactive >= days),
      }))
      .filter((g) => g.accounts.length > 0)
      .sort((x, y) => {
        if (!x.rep_id) return 1;
        if (!y.rep_id) return -1;
        return y.accounts.length - x.accounts.length;
      });
  }, [groups, days]);

  const enviables = filtered.filter((g) => g.rep_id && g.rep_email && g.accounts.length);
  const totalCuentas = filtered.reduce((s, g) => s + g.accounts.length, 0);

  const toggle = (key: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const enviar = async (repId: string): Promise<boolean> => {
    setSending(repId);
    try {
      const res = await fetch(`/api/vendedores/${repId}/clientes-inactivos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Error al enviar");
      toast.success(`Recordatorio enviado a ${json.repName}`, { description: `${json.count} clientes · ${json.to}` });
      return true;
    } catch (err) {
      toast.error("No se pudo enviar", { description: err instanceof Error ? err.message : String(err) });
      return false;
    } finally {
      setSending(null);
    }
  };

  const enviarTodos = async () => {
    if (!confirm(`¿Enviar el recordatorio (${days} días) a ${enviables.length} vendedores?`)) return;
    setBulk(true);
    let ok = 0;
    for (const g of enviables) {
      if (g.rep_id && (await enviar(g.rep_id))) ok++;
    }
    setBulk(false);
    toast.success(`Listo: ${ok}/${enviables.length} recordatorios enviados`);
  };

  return (
    <div className="space-y-4">
      {/* Umbral de inactividad */}
      <div className="rounded-lg border bg-card p-4">
        <div className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
          Sin actividad desde hace al menos
        </div>
        <div className="flex flex-wrap gap-2">
          {DAY_OPTIONS.map((d) => {
            const on = days === d;
            return (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                  on ? "border-brand-carmesi bg-brand-carmesi text-white" : "text-muted-foreground hover:bg-muted"
                }`}
              >
                {d} días
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-4">
        <div className="text-sm">
          <span className="font-medium">{totalCuentas}</span> clientes sin seguimiento ·{" "}
          <span className="font-medium">{enviables.length}</span> vendedores con recordatorios
        </div>
        <Button onClick={enviarTodos} disabled={bulk || enviables.length === 0}>
          {bulk ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Send className="mr-1 h-4 w-4" />}
          Enviar a todos ({enviables.length})
        </Button>
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          Ningún cliente lleva {days} días o más sin actividad.
        </p>
      ) : (
        filtered.map((g) => {
          const key = g.rep_id ?? "__sin__";
          const isOpen = open.has(key);
          const canSend = !!(g.rep_id && g.rep_email);
          return (
            <Card key={key}>
              <CardContent className="p-0">
                <div className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <button onClick={() => toggle(key)} className="flex items-center gap-2 text-left">
                    {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    <span className="font-medium">{g.rep_name}</span>
                    <Badge variant="warning">{g.accounts.length}</Badge>
                    {g.rep_email && <span className="text-xs text-muted-foreground">{g.rep_email}</span>}
                  </button>
                  {canSend ? (
                    <Button size="sm" variant="outline" onClick={() => enviar(g.rep_id!)} disabled={sending === g.rep_id || bulk}>
                      {sending === g.rep_id ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Mail className="mr-1 h-3.5 w-3.5" />}
                      Enviar recordatorio
                    </Button>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      {g.rep_id ? "Vendedor sin email" : "Asigna un vendedor a estas cuentas"}
                    </span>
                  )}
                </div>

                {isOpen && (
                  <div className="border-t">
                    <table className="min-w-full text-sm">
                      <tbody>
                        {g.accounts.map((a) => (
                          <tr key={a.account_id} className="border-b last:border-b-0">
                            <td className="px-4 py-2">
                              <Link href={`/cuentas/${a.account_id}`} className="font-medium text-brand-carmesi hover:underline">
                                {a.business_name}
                              </Link>
                            </td>
                            <td className="px-4 py-2 text-muted-foreground">
                              {lastContactLabel(a.days_inactive, a.last_activity_date)}
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
        })
      )}
    </div>
  );
}
