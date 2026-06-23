"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Award, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn, formatCurrency } from "@/lib/utils";

const PERIODOS = [
  { label: "3 meses", meses: 3 },
  { label: "6 meses", meses: 6 },
  { label: "12 meses", meses: 12 },
];

const MESES_LABEL: Record<string, string> = {
  "01": "Ene", "02": "Feb", "03": "Mar", "04": "Abr",
  "05": "May", "06": "Jun", "07": "Jul", "08": "Ago",
  "09": "Sep", "10": "Oct", "11": "Nov", "12": "Dic",
};

function mesLabel(m: string) {
  const [, mm] = m.split("-");
  return MESES_LABEL[mm] ?? mm;
}

type MesData = { mes: string; pedidos: number; total: number; ticket: number | null };
type RepRow = {
  rep_id: string;
  rep_name: string;
  meses: MesData[];
  ticket_promedio: number;
  total_pedidos: number;
};

function Trend({ current, prev }: { current: number | null; prev: number | null }) {
  if (current === null || prev === null) return <Minus className="h-3 w-3 text-muted-foreground" />;
  const diff = current - prev;
  if (diff > 0) return <TrendingUp className="h-3 w-3 text-emerald-500" />;
  if (diff < 0) return <TrendingDown className="h-3 w-3 text-red-400" />;
  return <Minus className="h-3 w-3 text-muted-foreground" />;
}

// Barra visual proporcional al ticket más alto del equipo
function TicketBar({ ticket, max }: { ticket: number; max: number }) {
  const pct = max > 0 ? Math.round((ticket / max) * 100) : 0;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <div
        className="h-full rounded-full bg-brand-carmesi transition-all duration-500"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function TicketPromedioClient({
  isAdmin,
  initialMeses,
}: {
  isAdmin: boolean;
  initialMeses: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [meses, setMeses] = useState(initialMeses);
  const [rows, setRows] = useState<RepRow[]>([]);
  const [mesesList, setMesesList] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  function navigate(m: number) {
    router.replace(`${pathname}?meses=${m}`);
  }

  useEffect(() => {
    setLoading(true);
    fetch(`/api/ventas/ticket?meses=${meses}`)
      .then((r) => r.json())
      .then((d) => {
        setRows(d.rows ?? []);
        setMesesList(d.meses ?? []);
      })
      .finally(() => setLoading(false));
  }, [meses]);

  const maxTicket = Math.max(...rows.map((r) => r.ticket_promedio), 1);

  return (
    <div className="space-y-6">
      {/* Selector de período */}
      <div className="inline-flex items-center gap-1 rounded-md bg-muted p-1">
        {PERIODOS.map((p) => (
          <button
            key={p.meses}
            onClick={() => { setMeses(p.meses); navigate(p.meses); }}
            className={cn(
              "rounded-sm px-3 py-1.5 text-sm font-medium transition-colors",
              meses === p.meses
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        Promedio por pedido (pedidos aceptados / facturados / entregados). No incluye borradores ni cancelados.
      </p>

      {loading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">Calculando...</div>
      ) : rows.length === 0 ? (
        <div className="py-12 text-center text-sm text-muted-foreground">
          Sin pedidos en este período.
        </div>
      ) : (
        <>
          {/* Cards de resumen por vendedor */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {rows.map((r, i) => (
              <Card key={r.rep_id} className={cn(i === 0 && "border-brand-carmesi/40")}>
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium truncate">{r.rep_name.split(" ")[0]}</p>
                    {i === 0 && isAdmin && <Award className="h-4 w-4 text-amber-500 shrink-0" />}
                  </div>
                  <p className="font-display text-xl text-brand-carmesi">
                    {formatCurrency(r.ticket_promedio)}
                  </p>
                  <TicketBar ticket={r.ticket_promedio} max={maxTicket} />
                  <p className="text-xs text-muted-foreground">{r.total_pedidos} pedido{r.total_pedidos !== 1 ? "s" : ""}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Tabla de evolución mensual */}
          <Card>
            <CardContent className="p-0">
              <div className="border-b p-4">
                <h2 className="font-display text-lg">Evolución mensual</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/30 text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2 text-left sticky left-0 bg-muted/30">Vendedor</th>
                      {mesesList.map((m) => (
                        <th key={m} className="px-4 py-2 text-right whitespace-nowrap">
                          {mesLabel(m)}
                        </th>
                      ))}
                      <th className="px-4 py-2 text-right bg-muted/50">Promedio</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.rep_id} className="border-t hover:bg-muted/20">
                        <td className="px-4 py-2 font-medium sticky left-0 bg-background">
                          {r.rep_name.split(" ")[0]}
                        </td>
                        {r.meses.map((md, idx) => {
                          const prev = idx > 0 ? r.meses[idx - 1].ticket : null;
                          return (
                            <td key={md.mes} className="px-4 py-2 text-right">
                              {md.ticket !== null ? (
                                <div className="flex items-center justify-end gap-1">
                                  <Trend current={md.ticket} prev={prev} />
                                  <span>{formatCurrency(md.ticket)}</span>
                                  <span className="text-xs text-muted-foreground">
                                    ({md.pedidos})
                                  </span>
                                </div>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                          );
                        })}
                        <td className="px-4 py-2 text-right font-semibold bg-muted/20">
                          {formatCurrency(r.ticket_promedio)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
