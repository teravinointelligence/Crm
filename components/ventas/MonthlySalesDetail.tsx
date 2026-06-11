"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { TableScroll } from "@/components/ui/table-scroll";
import { Pager } from "@/components/ui/pagination";
import { usePagedRows } from "@/components/ui/use-paged-rows";
import { formatCurrency } from "@/lib/utils";
import type { MonthlySale } from "@/types/database";

type Props = {
  sales: MonthlySale[];
  reps: { id: string; full_name: string }[];
  isAdmin: boolean;
};

export function MonthlySalesDetail({ sales, reps, isAdmin }: Props) {
  const [query, setQuery] = useState("");
  const repName = useMemo(() => new Map(reps.map((r) => [r.id, r.full_name])), [reps]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sales;
    return sales.filter(
      (v) =>
        (v.client_name ?? "").toLowerCase().includes(q) ||
        (v.client_number ?? "").toLowerCase().includes(q),
    );
  }, [sales, query]);

  const { paged, page, pageCount, setPage, total } = usePagedRows(filtered);

  return (
    <Card><CardContent className="p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
        <h2 className="font-display text-lg">Detalle por cliente</h2>
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por cliente o # cliente…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>
      <TableScroll className="rounded-none border-0">
        <table className="w-full text-sm">
          <thead className="bg-muted/30 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-2 text-left"># Cliente</th>
              <th className="px-4 py-2 text-left">Cliente</th>
              {isAdmin && <th className="px-4 py-2 text-left">Vendedor</th>}
              <th className="px-4 py-2 text-right">Venta bruta</th>
              <th className="px-4 py-2 text-right">Descuento</th>
              <th className="px-4 py-2 text-right">Neto-Desc.</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={isAdmin ? 6 : 5} className="px-4 py-8 text-center text-muted-foreground">
                  Sin clientes que coincidan con la búsqueda.
                </td>
              </tr>
            ) : (
              paged.map((v) => (
                <tr key={v.id} className="border-t hover:bg-muted/20">
                  <td className="px-4 py-2 font-mono text-xs">{v.client_number ?? "—"}</td>
                  <td className="px-4 py-2">
                    <Link href={`/cuentas/${v.account_id}`} className="hover:text-brand-carmesi">
                      {v.client_name ?? "—"}
                    </Link>
                  </td>
                  {isAdmin && <td className="px-4 py-2 text-muted-foreground">{v.sales_rep_id ? repName.get(v.sales_rep_id) ?? "—" : "—"}</td>}
                  <td className="px-4 py-2 text-right">{formatCurrency(v.venta_bruta)}</td>
                  <td className="px-4 py-2 text-right text-muted-foreground">{formatCurrency(v.descuento)}</td>
                  <td className="px-4 py-2 text-right">{formatCurrency(v.neto_desc)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </TableScroll>
      <Pager page={page} pageCount={pageCount} total={total} onPageChange={setPage} className="border-t px-4 py-3" />
    </CardContent></Card>
  );
}
