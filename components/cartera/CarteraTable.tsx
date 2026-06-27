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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/ui/empty-state";
import { TableScroll } from "@/components/ui/table-scroll";
import { STICKY_CELL, STICKY_HEAD } from "@/components/ui/table-sticky";
import { Pager } from "@/components/ui/pagination";
import { usePagedRows } from "@/components/ui/use-paged-rows";
import { SemaforoBadge } from "@/components/cartera/SemaforoBadge";
import { formatCurrency } from "@/lib/utils";

const ALL = "_all";

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
  const [vendedor, setVendedor] = useState<string>(ALL);

  // Lista de vendedores presentes en la cartera. Como el RLS ya scopea las filas
  // por vendedor, esta lista trae varios solo para admin/contador; para un
  // vendedor normal queda en uno y el selector se oculta.
  const vendedores = useMemo(
    () =>
      Array.from(
        new Set(rows.map((r) => r.vendedor).filter((v): v is string => Boolean(v))),
      ).sort((a, b) => a.localeCompare(b, "es")),
    [rows],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (vendedor !== ALL && r.vendedor !== vendedor) return false;
      if (
        q &&
        ![r.businessName, r.clientNumber]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q))
      )
        return false;
      return true;
    });
  }, [query, vendedor, rows]);

  // Vendedor a resumir: el seleccionado o, si la cartera trae uno solo (caso
  // vendedor normal por RLS), ese único. Para admin viendo "Todos" queda null.
  const vendedorMostrado =
    vendedor !== ALL ? vendedor : vendedores.length === 1 ? vendedores[0] : null;

  // Subtotal del vendedor mostrado (acotado por la búsqueda activa). Los KPIs de
  // arriba siguen reflejando toda la cartera.
  const subtotal = useMemo(
    () =>
      filtered.reduce(
        (acc, r) => {
          acc.pendiente += r.saldoPendiente ?? 0;
          acc.vencido += r.saldoVencido ?? 0;
          return acc;
        },
        { pendiente: 0, vencido: 0 },
      ),
    [filtered],
  );

  const { paged, page, pageCount, setPage, total } = usePagedRows(filtered);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-md flex-1">
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
        {vendedores.length > 1 && (
          <Select value={vendedor} onValueChange={setVendedor}>
            <SelectTrigger className="sm:w-56" aria-label="Filtrar por vendedor">
              <SelectValue placeholder="Vendedor" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos los vendedores</SelectItem>
              {vendedores.map((v) => (
                <SelectItem key={v} value={v}>
                  {v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {vendedorMostrado && (
        <div className="flex flex-wrap gap-x-6 gap-y-1 rounded-lg border bg-muted/30 px-4 py-3 text-sm">
          <span className="font-medium">{vendedorMostrado}</span>
          <span className="text-muted-foreground">
            {filtered.length} cliente{filtered.length === 1 ? "" : "s"}
          </span>
          <span>
            Pendiente:{" "}
            <span className="font-medium">{formatCurrency(subtotal.pendiente)}</span>
          </span>
          <span>
            Vencido:{" "}
            <span
              className={
                subtotal.vencido > 0 ? "font-medium text-red-600" : "font-medium"
              }
            >
              {formatCurrency(subtotal.vencido)}
            </span>
          </span>
        </div>
      )}

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
