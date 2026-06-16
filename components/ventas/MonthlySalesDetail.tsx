"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Search, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { TableScroll } from "@/components/ui/table-scroll";
import { Pager } from "@/components/ui/pagination";
import { usePagedRows } from "@/components/ui/use-paged-rows";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/utils";
import type { MonthlySale } from "@/types/database";

type Props = {
  sales: MonthlySale[];
  reps: { id: string; full_name: string }[];
  isAdmin: boolean;
};

export function MonthlySalesDetail({ sales, reps, isAdmin }: Props) {
  const router = useRouter();
  const supabase = createClient();
  const [query, setQuery] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const repName = useMemo(() => new Map(reps.map((r) => [r.id, r.full_name])), [reps]);

  // Asigna vendedor a una cuenta sin uno: persiste en la cuenta (lo heredan
  // futuras importaciones) y en la fila de ventas actual (refleja al instante).
  const handleAssign = async (sale: MonthlySale, repId: string) => {
    setPendingId(sale.id);
    const [accRes, salesRes] = await Promise.all([
      supabase.from("accounts").update({ assigned_rep_id: repId }).eq("id", sale.account_id),
      supabase.from("monthly_sales").update({ sales_rep_id: repId }).eq("id", sale.id),
    ]);
    setPendingId(null);
    const error = accRes.error ?? salesRes.error;
    if (error) {
      toast.error("No se pudo asignar el vendedor", { description: error.message });
      return;
    }
    toast.success(`Asignado a ${repName.get(repId) ?? "vendedor"}`);
    router.refresh();
  };

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
                  {isAdmin && (
                    <td className="px-4 py-2 text-muted-foreground">
                      {v.sales_rep_id ? (
                        repName.get(v.sales_rep_id) ?? "—"
                      ) : (
                        <div className="flex items-center gap-2">
                          <Select
                            disabled={pendingId === v.id}
                            onValueChange={(repId) => handleAssign(v, repId)}
                          >
                            <SelectTrigger className="h-8 w-44">
                              <SelectValue placeholder="Asignar vendedor…" />
                            </SelectTrigger>
                            <SelectContent>
                              {reps.map((r) => (
                                <SelectItem key={r.id} value={r.id}>
                                  {r.full_name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {pendingId === v.id && (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          )}
                        </div>
                      )}
                    </td>
                  )}
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
