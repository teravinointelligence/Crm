"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
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
import { Pager } from "@/components/ui/pagination";
import { usePagedRows } from "@/components/ui/use-paged-rows";
import { formatDateTime } from "@/lib/utils";

export type TomaRow = {
  id: string;
  created_at: string | null;
  region: string | null;
  qty: number;
  notes: string | null;
  product_name: string;
  rep_name: string | null;
  account_name: string | null;
};

const ALL = "_all";

export function SampleHistoryClient({ rows }: { rows: TomaRow[] }) {
  const [query, setQuery] = useState("");
  const [rep, setRep] = useState(ALL);
  const [account, setAccount] = useState(ALL);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const reps = useMemo(
    () => Array.from(new Set(rows.map((r) => r.rep_name).filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b)),
    [rows],
  );
  const accounts = useMemo(
    () => Array.from(new Set(rows.map((r) => r.account_name).filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b)),
    [rows],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (rep !== ALL && r.rep_name !== rep) return false;
      if (account !== ALL && r.account_name !== account) return false;
      if (from && (r.created_at ?? "").slice(0, 10) < from) return false;
      if (to && (r.created_at ?? "").slice(0, 10) > to) return false;
      if (q && !r.product_name.toLowerCase().includes(q) && !(r.notes ?? "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, query, rep, account, from, to]);

  const { paged, page, pageCount, setPage, total } = usePagedRows(filtered);
  const totalBtl = filtered.reduce((s, r) => s + r.qty, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar vino o nota…" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-9" />
        </div>
        <Select value={rep} onValueChange={setRep}>
          <SelectTrigger className="sm:w-44"><SelectValue placeholder="Vendedor" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos los vendedores</SelectItem>
            {reps.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={account} onValueChange={setAccount}>
          <SelectTrigger className="sm:w-48"><SelectValue placeholder="Cliente" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos los clientes</SelectItem>
            {accounts.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-1.5">
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-[9.5rem]" />
          <span className="text-muted-foreground">→</span>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-[9.5rem]" />
        </div>
      </div>

      <div className="text-xs text-muted-foreground">
        {filtered.length} tomas · {totalBtl} botellas
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="Sin tomas"
          description={rows.length === 0 ? "Aún no se han tomado muestras del banco." : "Ajusta los filtros."}
        />
      ) : (
        <TableScroll>
          <table className="min-w-full text-sm">
            <thead className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3">Vino</th>
                <th className="px-4 py-3">Zona</th>
                <th className="px-4 py-3 text-right">Cant.</th>
                <th className="px-4 py-3">Vendedor</th>
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">Nota</th>
              </tr>
            </thead>
            <tbody>
              {paged.map((r) => (
                <tr key={r.id} className="border-b last:border-b-0 hover:bg-muted/30">
                  <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{r.created_at ? formatDateTime(r.created_at) : "—"}</td>
                  <td className="px-4 py-3 font-medium">{r.product_name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{r.region ?? "—"}</td>
                  <td className="px-4 py-3 text-right font-medium">{r.qty}</td>
                  <td className="px-4 py-3 text-muted-foreground">{r.rep_name ?? "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{r.account_name ?? "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{r.notes ?? "—"}</td>
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
