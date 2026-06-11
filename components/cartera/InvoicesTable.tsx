"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { TableScroll } from "@/components/ui/table-scroll";
import { formatCurrency, formatDate } from "@/lib/utils";
import { bucketDeDias, BUCKET_LABEL, diasVencidos, type BucketKey } from "@/lib/cartera";
import type { Invoice } from "@/types/database";

type Filtro = "todas" | "vencidas" | "por_vencer" | "pagadas";

const invoiceStatusVariant: Record<string, "success" | "warning" | "danger" | "muted"> = {
  pagada: "success",
  pendiente: "warning",
  pagada_parcial: "warning",
  vencida: "danger",
  cancelada: "muted",
};

const bucketTextClass: Record<BucketKey, string> = {
  b_1_31: "",
  b_32_62: "text-amber-600",
  b_63_93: "text-orange-600",
  b_94_mas: "text-red-600",
};

function esVencida(i: Invoice, creditDays: number, hoy: Date) {
  const dv = diasVencidos(i.invoice_date, creditDays, hoy);
  return dv != null && dv > 0 && (i.balance ?? 0) > 0;
}
function esPorVencer(i: Invoice, creditDays: number, hoy: Date) {
  const dv = diasVencidos(i.invoice_date, creditDays, hoy);
  return (i.balance ?? 0) > 0 && (dv == null || dv <= 0);
}
function esPagada(i: Invoice) {
  return (i.balance ?? 0) <= 0;
}

export function InvoicesTable({
  invoices,
  creditDays = 0,
}: {
  invoices: Invoice[];
  /** Días de crédito pactados del cliente (para el cálculo de días vencidos). */
  creditDays?: number | null;
}) {
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const hoy = useMemo(() => new Date(), []);
  const cd = Number(creditDays ?? 0);

  const conteos = useMemo(() => {
    let vencidas = 0;
    let porVencer = 0;
    let pagadas = 0;
    for (const i of invoices) {
      if (esPagada(i)) pagadas++;
      else if (esVencida(i, cd, hoy)) vencidas++;
      else if (esPorVencer(i, cd, hoy)) porVencer++;
    }
    return { todas: invoices.length, vencidas, por_vencer: porVencer, pagadas };
  }, [invoices, cd, hoy]);

  const filtradas = useMemo(() => {
    const base =
      filtro === "vencidas"
        ? invoices.filter((i) => esVencida(i, cd, hoy))
        : filtro === "por_vencer"
          ? invoices.filter((i) => esPorVencer(i, cd, hoy))
          : filtro === "pagadas"
            ? invoices.filter((i) => esPagada(i))
            : invoices;
    // De la más vieja a la más nueva (Sección 6 de la spec).
    return [...base].sort(
      (a, b) => new Date(a.invoice_date ?? 0).getTime() - new Date(b.invoice_date ?? 0).getTime(),
    );
  }, [invoices, filtro, cd, hoy]);

  const totalSaldo = useMemo(
    () => filtradas.reduce((acc, i) => acc + Number(i.balance ?? 0), 0),
    [filtradas],
  );

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
        <TableScroll className="rounded-none border-0">
        <table className="min-w-full text-sm">
          <thead className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Folio</th>
              <th className="px-4 py-3">Emisión</th>
              <th className="px-4 py-3">Vencimiento</th>
              <th className="px-4 py-3 text-right">Días vencidos</th>
              <th className="px-4 py-3">Antigüedad</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Total</th>
              <th className="px-4 py-3 text-right">Pagado</th>
              <th className="px-4 py-3 text-right">Saldo</th>
            </tr>
          </thead>
          <tbody>
            {filtradas.map((i) => {
              const dv = diasVencidos(i.invoice_date, cd, hoy);
              const open = (i.balance ?? 0) > 0;
              const bucket: BucketKey | null = open && dv != null && dv > 0 ? bucketDeDias(dv) : null;
              const overdue = open && dv != null && dv > 0;
              return (
                <tr key={i.id} className="border-b last:border-b-0">
                  <td className="px-4 py-3 font-medium">{i.invoice_number}</td>
                  <td className="px-4 py-3 text-muted-foreground">{formatDate(i.invoice_date)}</td>
                  <td className={`px-4 py-3 ${overdue ? "text-red-600" : "text-muted-foreground"}`}>
                    {i.due_date ? formatDate(i.due_date) : "—"}
                  </td>
                  <td className={`px-4 py-3 text-right ${bucket ? bucketTextClass[bucket] : "text-muted-foreground"}`}>
                    {overdue ? `${dv} d` : "—"}
                  </td>
                  <td className={`px-4 py-3 ${bucket ? bucketTextClass[bucket] : "text-muted-foreground"}`}>
                    {bucket ? BUCKET_LABEL[bucket] : open ? "Por vencer" : "—"}
                  </td>
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
          <tfoot>
            <tr className="border-t-2 bg-muted/30 font-medium">
              <td className="px-4 py-3" colSpan={8}>
                TOTAL ({filtradas.length})
              </td>
              <td className="px-4 py-3 text-right">{formatCurrency(totalSaldo)}</td>
            </tr>
          </tfoot>
        </table>
        </TableScroll>
      )}
    </div>
  );
}
