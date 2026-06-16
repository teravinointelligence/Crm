"use client";

// Monitor de uso por miembro del equipo (solo admin). Para el periodo elegido
// (7/30/90 días) cuenta lo que cada vendedor REGISTRÓ en la app —citas
// agendadas, actividades, contactos, cotizaciones, pedidos, muestras— usando
// created_at (mide la acción de capturar, no la fecha del evento). Así el admin
// ve qué tanto y cómo está usando el CRM cada quien. Lee todo vía RLS de admin.

import { useEffect, useMemo, useState } from "react";
import {
  CalendarClock,
  ClipboardList,
  Users,
  FileText,
  PackageCheck,
  FlaskConical,
  Loader2,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TableScroll } from "@/components/ui/table-scroll";
import { createClient } from "@/lib/supabase/client";

type RepRow = {
  id: string;
  full_name: string;
  last_seen_at: string | null;
  citas: number;
  actividades: number;
  contactos: number;
  cotizaciones: number;
  pedidos: number;
  muestras: number;
  total: number;
};

const PERIODS = [
  { days: 7, label: "7 días" },
  { days: 30, label: "30 días" },
  { days: 90, label: "90 días" },
] as const;

function lastSeenLabel(iso: string | null): { text: string; online: boolean } {
  if (!iso) return { text: "Nunca", online: false };
  const diff = Date.now() - new Date(iso).getTime();
  const online = diff < 5 * 60_000;
  if (online) return { text: "En línea", online: true };
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return { text: `hace ${mins} min`, online: false };
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return { text: `hace ${hrs} h`, online: false };
  const days = Math.floor(hrs / 24);
  if (days < 30) return { text: `hace ${days} d`, online: false };
  return { text: `hace ${Math.floor(days / 30)} mes(es)`, online: false };
}

export function TeamActivityBoard() {
  const supabase = useMemo(() => createClient(), []);
  const [days, setDays] = useState<number>(30);
  const [rows, setRows] = useState<RepRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const start = new Date();
      start.setDate(start.getDate() - days);
      start.setHours(0, 0, 0, 0);
      const startISO = start.toISOString();

      const [repsRes, actsRes, contactsRes, ordersRes, samplesRes] = await Promise.all([
        supabase
          .from("sales_reps")
          .select("id, full_name, last_seen_at")
          .eq("active", true)
          .order("full_name"),
        supabase
          .from("activities")
          .select("sales_rep_id, status")
          .gte("created_at", startISO)
          .limit(20000),
        supabase
          .from("contacts")
          .select("created_by, accounts:account_id(assigned_rep_id)")
          .gte("created_at", startISO)
          .limit(20000),
        supabase
          .from("orders")
          .select("sales_rep_id, order_type")
          .gte("created_at", startISO)
          .limit(20000),
        supabase
          .from("sample_requests")
          .select("sales_rep_id")
          .gte("created_at", startISO)
          .limit(20000),
      ]);

      if (cancelled) return;

      const base = new Map<string, RepRow>();
      for (const r of (repsRes.data ?? []) as { id: string; full_name: string; last_seen_at: string | null }[]) {
        base.set(r.id, {
          id: r.id,
          full_name: r.full_name,
          last_seen_at: r.last_seen_at,
          citas: 0,
          actividades: 0,
          contactos: 0,
          cotizaciones: 0,
          pedidos: 0,
          muestras: 0,
          total: 0,
        });
      }

      for (const a of (actsRes.data ?? []) as { sales_rep_id: string | null; status: string | null }[]) {
        const row = a.sales_rep_id ? base.get(a.sales_rep_id) : undefined;
        if (!row) continue;
        if (a.status === "agendada") row.citas += 1;
        else if (a.status === "realizada") row.actividades += 1;
      }

      for (const c of (contactsRes.data ?? []) as unknown as { created_by: string | null; accounts: { assigned_rep_id: string | null } | null }[]) {
        // Atribuye a quien lo capturó (created_by); para contactos históricos
        // sin created_by, cae al vendedor dueño de la cuenta.
        const repId = c.created_by ?? c.accounts?.assigned_rep_id ?? null;
        const row = repId ? base.get(repId) : undefined;
        if (row) row.contactos += 1;
      }

      for (const o of (ordersRes.data ?? []) as { sales_rep_id: string | null; order_type: string | null }[]) {
        const row = o.sales_rep_id ? base.get(o.sales_rep_id) : undefined;
        if (!row) continue;
        if (o.order_type === "pedido") row.pedidos += 1;
        else row.cotizaciones += 1;
      }

      for (const s of (samplesRes.data ?? []) as { sales_rep_id: string | null }[]) {
        const row = s.sales_rep_id ? base.get(s.sales_rep_id) : undefined;
        if (row) row.muestras += 1;
      }

      const out = Array.from(base.values());
      for (const r of out) {
        r.total = r.citas + r.actividades + r.contactos + r.cotizaciones + r.pedidos + r.muestras;
      }
      out.sort((a, b) => b.total - a.total || a.full_name.localeCompare(b.full_name));
      setRows(out);
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [supabase, days]);

  const cols: { key: keyof RepRow; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { key: "citas", label: "Citas agendadas", icon: CalendarClock },
    { key: "actividades", label: "Actividades", icon: ClipboardList },
    { key: "contactos", label: "Contactos", icon: Users },
    { key: "cotizaciones", label: "Cotizaciones", icon: FileText },
    { key: "pedidos", label: "Pedidos", icon: PackageCheck },
    { key: "muestras", label: "Muestras", icon: FlaskConical },
  ];

  return (
    <Card>
      <CardContent className="p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
          <div>
            <h2 className="font-display text-lg">Actividad del equipo</h2>
            <p className="text-xs text-muted-foreground">
              Lo que cada quien registró en el CRM en el periodo. Mide qué tanto y cómo usan la app.
            </p>
          </div>
          <div className="flex gap-1.5">
            {PERIODS.map((p) => (
              <button
                key={p.days}
                onClick={() => setDays(p.days)}
                className={
                  p.days === days
                    ? "rounded-full bg-brand-carmesi px-3 py-1 text-xs font-medium text-white"
                    : "rounded-full bg-muted px-3 py-1 text-xs text-foreground/70 hover:bg-muted/70"
                }
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Cargando actividad…
          </div>
        ) : (
          <TableScroll className="rounded-none border-0">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-left">Vendedor</th>
                  <th className="px-4 py-2 text-right">Total</th>
                  {cols.map((c) => (
                    <th key={c.key} className="px-4 py-2 text-right whitespace-nowrap">{c.label}</th>
                  ))}
                  <th className="px-4 py-2 text-left whitespace-nowrap">Última conexión</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={cols.length + 3} className="px-4 py-8 text-center text-muted-foreground">
                      Sin vendedores activos.
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => {
                    const seen = lastSeenLabel(r.last_seen_at);
                    const idle = r.total === 0;
                    return (
                      <tr key={r.id} className={`border-t ${idle ? "bg-amber-50/40" : "hover:bg-muted/20"}`}>
                        <td className="px-4 py-2 font-medium">
                          {r.full_name}
                          {idle && (
                            <Badge variant="warning" className="ml-2 align-middle">Sin actividad</Badge>
                          )}
                        </td>
                        <td className="px-4 py-2 text-right font-display text-brand-carmesi">{r.total}</td>
                        {cols.map((c) => (
                          <td key={c.key} className="px-4 py-2 text-right tabular-nums">
                            {(r[c.key] as number) || <span className="text-muted-foreground">0</span>}
                          </td>
                        ))}
                        <td className="px-4 py-2 whitespace-nowrap">
                          {seen.online ? (
                            <span className="inline-flex items-center gap-1.5 text-emerald-700">
                              <span className="h-2 w-2 rounded-full bg-emerald-500" /> {seen.text}
                            </span>
                          ) : (
                            <span className={r.last_seen_at ? "text-muted-foreground" : "text-amber-700"}>{seen.text}</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </TableScroll>
        )}
      </CardContent>
    </Card>
  );
}
