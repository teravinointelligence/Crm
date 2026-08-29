"use client";

// Lista de "Crédito de clientes" (vista de Reparto) con buscador. Recibe todas
// las filas ya clasificadas desde el server component y filtra en el cliente por
// nombre, número de cliente, región o vendedor. KPIs y secciones reflejan el
// resultado del filtro. No muestra montos $ (solo clasificación y días vencidos).

import { useMemo, useState } from "react";
import { Search, ShieldCheck, CheckCircle2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import type { ClaseRiesgo } from "@/lib/cobranza";
import { creditDaysLabel } from "@/lib/credit-terms";

export type CreditoRow = {
  accountId: string;
  nombre: string;
  clientNumber: string | null;
  region: string | null;
  vendedor: string | null;
  diasVencido: number | null;
  esSocio: boolean | null;
  creditDays: number | null;
  clase: ClaseRiesgo;
  detalle: string;
};

export function CreditoClientesList({ rows }: { rows: CreditoRow[] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.nombre, r.clientNumber, r.region, r.vendedor]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [query, rows]);

  const byClass = (clase: ClaseRiesgo) =>
    filtered
      .filter((r) => r.clase === clase)
      .sort((a, b) => (b.diasVencido ?? 0) - (a.diasVencido ?? 0));

  const suspender = byClass("Suspender Crédito");
  const liberado = byClass("Crédito Liberado");

  return (
    <div className="space-y-6">
      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar cliente, # cliente, región o vendedor…"
          className="pl-9"
          aria-label="Buscar cliente"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Kpi label="Crédito suspendido o contado" value={suspender.length} tone="danger" />
        <Kpi label="Crédito disponible" value={liberado.length} tone="ok" />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="Sin cartera aún"
          description="No hay clientes con facturas cargadas todavía."
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="Sin resultados"
          description={`Ningún cliente coincide con "${query}".`}
        />
      ) : (
        <div className="space-y-6">
          <Section
            title="Crédito suspendido o contado"
            description="No entregar a crédito. En contado, el pedido requiere pago antes de entrega."
            icon={<ShieldCheck className="h-5 w-5 text-red-700" />}
            rows={suspender}
            variant="danger"
          />
          <Section
            title="Crédito disponible — OK entregar"
            description="Entregar respetando el plazo vigente que aparece en la tabla."
            icon={<CheckCircle2 className="h-5 w-5 text-emerald-700" />}
            rows={liberado}
            variant="success"
          />
        </div>
      )}
    </div>
  );
}

function Section({
  title,
  description,
  icon,
  rows,
  variant,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
  rows: CreditoRow[];
  variant: "danger" | "warning" | "success" | "muted";
}) {
  if (rows.length === 0) return null;
  return (
    <Card>
      <CardContent className="p-0">
        <div className="flex items-center gap-2 border-b px-4 py-3">
          {icon}
          <div>
            <h2 className="font-display text-lg">
              {title}{" "}
              <span className="text-sm font-normal text-muted-foreground">({rows.length})</span>
            </h2>
            <p className="text-xs text-muted-foreground">{description}</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2">Cliente</th>
                <th className="px-4 py-2">Región</th>
                <th className="px-4 py-2">Vendedor</th>
                <th className="px-4 py-2 text-right">Plazo</th>
                <th className="px-4 py-2 text-right">Días vencido</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.accountId} className="border-b last:border-b-0 hover:bg-muted/30">
                  <td className="px-4 py-2">
                    <div className="font-medium">{r.nombre}</div>
                    <div className="flex flex-wrap items-center gap-2">
                      {r.clientNumber && (
                        <span className="text-xs text-muted-foreground"># {r.clientNumber}</span>
                      )}
                      {r.esSocio && (
                        <Badge variant="warning" className="text-[10px]">Socio</Badge>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">{r.region ?? "—"}</td>
                  <td className="px-4 py-2 text-muted-foreground">{r.vendedor ?? "—"}</td>
                  <td className="px-4 py-2 text-right font-medium">
                    {creditDaysLabel(r.creditDays)}
                  </td>
                  <td
                    className={`px-4 py-2 text-right ${
                      variant === "danger"
                        ? "font-medium text-red-700"
                        : variant === "warning"
                          ? "text-amber-700"
                          : "text-muted-foreground"
                    }`}
                  >
                    {(r.diasVencido ?? 0) > 0 ? `${r.diasVencido} días` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function Kpi({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "danger" | "warning" | "ok" | "muted";
}) {
  const cls =
    tone === "danger"
      ? "text-red-700"
      : tone === "warning"
        ? "text-amber-700"
        : tone === "ok"
          ? "text-emerald-700"
          : "text-muted-foreground";
  return (
    <Card>
      <CardContent className="space-y-1 p-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className={`font-display text-2xl ${cls}`}>{value}</p>
      </CardContent>
    </Card>
  );
}
