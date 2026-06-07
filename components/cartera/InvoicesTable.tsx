"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { Invoice } from "@/types/database";

type Filtro = "todas" | "vencidas" | "por_vencer" | "pagadas";

const invoiceStatusVariant: Record<string, "success" | "warning" | "danger" | "muted"> = {
  pagada: "success",
  pendiente: "warning",
  pagada_parcial: "warning",
  vencida: "danger",
  cancelada: "muted",
};

function ageInDays(date: string | null) {
  if (!date) return null;
  return Math.floor((Date.now() - new Date(date).getTime()) / 86400000);
}

function esVencida(i: Invoice, hoy: Date) {
  return !!i.due_date && new Date(i.due_date) < hoy && (i.balance ?? 0) > 0;
}
function esPorVencer(i: Invoice, hoy: Date) {
  return (i.balance ?? 0) > 0 && (!i.due_date || new Date(i.due_date) >= hoy);
}
function esPagada(i: Invoice) {
  return (i.balance ?? 0) <= 0;
}

export function InvoicesTable({ invoices }: { invoices: Invoice[] }) {
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const hoy = useMemo(() => new Date(), []);

  const conteos = useMemo(() => {
    let vencidas = 0;
    let porVencer = 0;
    let pagadas = 0;
    for (const i of invoices) {
      if (esPagada(i)) pagadas++;
      else if (esVencida(i, hoy)) vencidas++;
      else if (esPorVencer(i, hoy)) porVencer++;
    }
    return { todas: invoices.length, vencidas, por_vencer: porVencer, pagadas };
  }, [invoices, hoy]);

  const filtradas = useMemo(() => {
    switch (filtro) {
      case "vencidas":
        return invoices.filter((i) => esVencida(i, hoy));
      case "por_vencer":
        return invoices.filter((i) => esPorVencer(i, hoy));
      case "pagadas":
        return invoices.filter((i) => esPagada(i));
      default:
        return invoices;
    }
  }, [invoices, filtro, hoy]);

  const tabs: { key: Filtro; label: string; count: number }[] = [
    { key: "todas", label: "Todas", count: conteos.todas },
    { key: "vencidas", label: "Vencidas", count: conteos.vencidas },
    { key: "por_vencer", label: "Por vencer", count: conteos.por_vencer },
    { key: "pagadas", label: "Pagadas", count: conteos.pagadas },
  ];

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 border-b px-6 py-3">
        <span className="font-display text-lg">Facturas</span>
        <div className="ml-auto flex flex-wrap gap-1">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setFiltro(t.key)}
              className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${
                filtro === t.key
                  ? "bg-brand-carmesi text-white"
                  : "text-muted-foreground hover:bg-muted"
              }`}
            >
              {t.label}
              <span
                className={`ml-1.5 text-xs ${
                  filtro === t.key ? "text-white/80" : "text-muted-foreground"
                }`}
              >
                {t.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {invoices.length === 0 ? (
        <div className="p-6">
          <EmptyState title="Sin facturas" description="Importa o registra facturas para este cliente." />
        </div>
      ) : filtradas.length === 0 ? (
        <div className="p-6 text-sm text-muted-foreground">
          Sin facturas en esta vista.
        </div>
      ) : (
        <table className="min-w-full text-sm">
          <thead className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Folio</th>
              <th className="px-4 py-3">Emisión</th>
              <th className="px-4 py-3">Vencimiento</th>
              <th className="px-4 py-3">Antigüedad</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Total</th>
              <th className="px-4 py-3 text-right">Pagado</th>
              <th className="px-4 py-3 text-right">Saldo</th>
            </tr>
          </thead>
          <tbody>
            {filtradas.map((i) => {
              const age = ageInDays(i.invoice_date);
              const overdue = esVencida(i, hoy);
              return (
                <tr key={i.id} className="border-b last:border-b-0">
                  <td className="px-4 py-3 font-medium">{i.invoice_number}</td>
                  <td className="px-4 py-3 text-muted-foreground">{formatDate(i.invoice_date)}</td>
                  <td className={`px-4 py-3 ${overdue ? "text-red-600" : "text-muted-foreground"}`}>
                    {i.due_date ? formatDate(i.due_date) : "—"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{age != null ? `${age} d` : "—"}</td>
                  <td className="px-4 py-3">
                    <Badge variant={invoiceStatusVariant[i.status ?? ""] ?? "muted"}>
                      {i.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right">{formatCurrency(i.total)}</td>
                  <td className="px-4 py-3 text-right text-muted-foreground">{formatCurrency(i.total_paid)}</td>
                  <td className="px-4 py-3 text-right font-medium">{formatCurrency(i.balance)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
