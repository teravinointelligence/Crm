"use client";

// Tabla de cartera con buscador por nombre y # de cliente. Recibe las filas ya
// enriquecidas (nombre, # cliente, vendedor, saldos) desde el server component,
// filtra en memoria y pagina en cliente. Los KPIs de arriba (en la página) siguen
// sumando todas las filas, no el resultado del filtro.

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { TableScroll } from "@/components/ui/table-scroll";
import { STICKY_CELL, STICKY_HEAD } from "@/components/ui/table-sticky";
import { Pager } from "@/components/ui/pagination";
import { usePagedRows } from "@/components/ui/use-paged-rows";
import { SemaforoBadge } from "@/components/cartera/SemaforoBadge";
import { formatCurrency } from "@/lib/utils";

export type CarteraRow = {
  accountId: string;
  businessName: string | null;
  clientNumber: string | null;
  region: string | null;
  vendedor: string | null;
  esSocio: boolean | null;
  totalFacturado: number | null;
  totalPagado: number | null;
  saldoPendiente: number | null;
  saldoVencido: number | null;
  diasVencido: number | null;
  facturasAbiertas: number | null;
};

export function CarteraTable({ rows }: { rows: CarteraRow[] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.businessName, r.clientNumber]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [query, rows]);

  const { paged, page, pageCount, setPage, total } = usePagedRows(filtered);

  return (
    <div className="space-y-4">
      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por nombre o # de cliente…"
          className="pl-9"
          aria-label="Buscar cliente"
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="Sin resultados"
          description={`Ningún cliente coincide con "${query}".`}
        />
      ) : (
        <TableScroll stickyRight>
          <table className="min-w-full text-sm">
            <thead className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">Región</th>
                <th className="px-4 py-3">Vendedor</th>
                <th className="px-4 py-3 text-right">Facturado</th>
                <th className="px-4 py-3 text-right">Pagado</th>
                <th className="px-4 py-3 text-right">Pendiente</th>
                <th className="px-4 py-3 text-right">Vencido</th>
                <th className="px-4 py-3 text-center">Facturas</th>
                <th className={`px-4 py-3 ${STICKY_HEAD}`}></th>
              </tr>
            </thead>
            <tbody>
              {paged.map((b) => (
                <tr
                  key={b.accountId}
                  className="border-b last:border-b-0 hover:bg-muted/30"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/cartera/${b.accountId}`}
                      className="font-medium hover:text-brand-carmesi"
                    >
                      {b.businessName ?? "—"}
                    </Link>
                    {b.esSocio && (
                      <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">
                        Socio · sin vencido
                      </span>
                    )}
                    {b.clientNumber && (
                      <div className="text-xs text-muted-foreground">
                        # {b.clientNumber}
                      </div>
                    )}
                    <div className="mt-1">
                      <SemaforoBadge
                        saldoPendiente={b.saldoPendiente ?? 0}
                        saldoVencido={b.saldoVencido ?? 0}
                        diasVencido={b.diasVencido}
                      />
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {b.region ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {b.vendedor ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {formatCurrency(b.totalFacturado)}
                  </td>
                  <td className="px-4 py-3 text-right text-muted-foreground">
                    {formatCurrency(b.totalPagado)}
                  </td>
                  <td className="px-4 py-3 text-right font-medium">
                    {formatCurrency(b.saldoPendiente)}
                  </td>
                  <td
                    className={`px-4 py-3 text-right ${
                      (b.saldoVencido ?? 0) > 0
                        ? "font-medium text-red-600"
                        : "text-muted-foreground"
                    }`}
                  >
                    {formatCurrency(b.saldoVencido)}
                  </td>
                  <td className="px-4 py-3 text-center text-muted-foreground">
                    {b.facturasAbiertas ?? 0}
                  </td>
                  <td className={`px-4 py-3 text-right ${STICKY_CELL}`}>
                    <Button asChild size="sm" variant="ghost">
                      <Link href={`/cartera/${b.accountId}`}>Estado de cuenta</Link>
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      )}

      <Pager page={page} pageCount={pageCount} total={total} onPageChange={setPage} />
    </div>
  );
}
