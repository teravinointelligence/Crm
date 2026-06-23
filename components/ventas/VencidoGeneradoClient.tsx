"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import Link from "next/link";

const MESES_LABEL: Record<string, string> = {
  "01": "Ene", "02": "Feb", "03": "Mar", "04": "Abr",
  "05": "May", "06": "Jun", "07": "Jul", "08": "Ago",
  "09": "Sep", "10": "Oct", "11": "Nov", "12": "Dic",
};

function mesLabel(m: string) {
  const [y, mm] = m.split("-");
  return `${MESES_LABEL[mm] ?? mm} ${y}`;
}

function mesOptions() {
  const opts: { value: string; label: string }[] = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    opts.push({ value: val, label: mesLabel(val) });
  }
  return opts;
}

type Factura = {
  id: string;
  invoice_number: string;
  account_name: string;
  region: string | null;
  due_date: string;
  balance: number;
  account_id: string;
};

type RepStat = {
  rep_id: string;
  rep_name: string;
  total_vencido: number;
  num_facturas: number;
  num_cuentas: number;
  facturas: Factura[];
};

function diasVencido(due: string) {
  const diff = Math.floor(
    (Date.now() - new Date(due).getTime()) / (1000 * 60 * 60 * 24),
  );
  return diff;
}

function vencidoBadge(dias: number): "danger" | "warning" | "muted" {
  if (dias > 30) return "danger";
  if (dias > 0) return "warning";
  return "muted";
}

export function VencidoGeneradoClient({
  isAdmin,
  initialMes,
}: {
  isAdmin: boolean;
  initialMes: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [mes, setMes] = useState(initialMes);
  const [stats, setStats] = useState<RepStat[]>([]);
  const [totalVencido, setTotalVencido] = useState(0);
  const [totalFacturas, setTotalFacturas] = useState(0);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  function navigate(m: string) {
    router.replace(`${pathname}?mes=${m}`);
  }

  useEffect(() => {
    setLoading(true);
    setExpanded(null);
    fetch(`/api/ventas/vencido?mes=${mes}`)
      .then((r) => r.json())
      .then((d) => {
        setStats(d.stats ?? []);
        setTotalVencido(d.totalVencido ?? 0);
        setTotalFacturas(d.totalFacturas ?? 0);
      })
      .finally(() => setLoading(false));
  }, [mes]);

  return (
    <div className="space-y-6">
      {/* Selector de mes */}
      <div className="flex items-center gap-3">
        <select
          value={mes}
          onChange={(e) => { setMes(e.target.value); navigate(e.target.value); }}
          className="rounded-md border bg-background px-3 py-1.5 text-sm"
        >
          {mesOptions().map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      <p className="text-xs text-muted-foreground">
        Facturas cuya fecha de vencimiento cayó en este mes y aún no se han pagado.
      </p>

      {loading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">Calculando...</div>
      ) : stats.length === 0 ? (
        <div className="py-12 text-center text-sm text-muted-foreground">
          Sin facturas vencidas en {mesLabel(mes)}.
        </div>
      ) : (
        <>
          {/* Resumen global */}
          <div className="grid grid-cols-3 gap-3">
            <Card>
              <CardContent className="p-4">
                <p className="text-xs uppercase text-muted-foreground">Vencido generado</p>
                <p className="font-display text-2xl text-red-500">{formatCurrency(totalVencido)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs uppercase text-muted-foreground">Facturas sin pagar</p>
                <p className="font-display text-2xl">{totalFacturas}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs uppercase text-muted-foreground">Vendedores afectados</p>
                <p className="font-display text-2xl">{stats.length}</p>
              </CardContent>
            </Card>
          </div>

          {/* Acordeón por vendedor */}
          <Card>
            <CardContent className="p-0">
              <div className="border-b p-4">
                <h2 className="font-display text-lg">Por vendedor</h2>
              </div>
              <div className="divide-y">
                {stats.map((s) => (
                  <div key={s.rep_id}>
                    {/* Header del vendedor */}
                    <button
                      onClick={() => setExpanded(expanded === s.rep_id ? null : s.rep_id)}
                      className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-muted/30 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        {expanded === s.rep_id
                          ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          : <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        }
                        <div>
                          <p className="font-medium">{s.rep_name}</p>
                          <p className="text-xs text-muted-foreground">
                            {s.num_facturas} factura{s.num_facturas !== 1 ? "s" : ""} · {s.num_cuentas} cuenta{s.num_cuentas !== 1 ? "s" : ""}
                          </p>
                        </div>
                      </div>
                      <span className="font-display text-lg text-red-500">
                        {formatCurrency(s.total_vencido)}
                      </span>
                    </button>

                    {/* Detalle de facturas */}
                    {expanded === s.rep_id && (
                      <div className="overflow-x-auto border-t bg-muted/10">
                        <table className="w-full text-sm">
                          <thead className="bg-muted/30 text-xs uppercase text-muted-foreground">
                            <tr>
                              <th className="px-4 py-2 text-left">Cliente</th>
                              <th className="px-4 py-2 text-left">Región</th>
                              <th className="px-4 py-2 text-left">Factura</th>
                              <th className="px-4 py-2 text-right">Venció</th>
                              <th className="px-4 py-2 text-right">Días</th>
                              <th className="px-4 py-2 text-right">Saldo</th>
                            </tr>
                          </thead>
                          <tbody>
                            {s.facturas.map((f) => {
                              const dias = diasVencido(f.due_date);
                              return (
                                <tr key={f.id} className="border-t hover:bg-muted/20">
                                  <td className="px-4 py-2">
                                    <Link
                                      href={`/cuentas/${f.account_id}`}
                                      className="text-brand-carmesi hover:underline font-medium"
                                    >
                                      {f.account_name}
                                    </Link>
                                  </td>
                                  <td className="px-4 py-2 text-muted-foreground text-xs">
                                    {f.region ?? "—"}
                                  </td>
                                  <td className="px-4 py-2 font-mono text-xs text-muted-foreground">
                                    {f.invoice_number}
                                  </td>
                                  <td className="px-4 py-2 text-right text-muted-foreground">
                                    {formatDate(f.due_date)}
                                  </td>
                                  <td className="px-4 py-2 text-right">
                                    <Badge variant={vencidoBadge(dias)}>
                                      {dias > 0 ? `${dias}d` : "Hoy"}
                                    </Badge>
                                  </td>
                                  <td className="px-4 py-2 text-right font-medium text-red-500">
                                    {formatCurrency(f.balance)}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                          <tfoot className="bg-muted/20 text-xs font-semibold">
                            <tr>
                              <td colSpan={5} className="px-4 py-2 text-right text-muted-foreground">
                                Total
                              </td>
                              <td className="px-4 py-2 text-right text-red-500">
                                {formatCurrency(s.total_vencido)}
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
