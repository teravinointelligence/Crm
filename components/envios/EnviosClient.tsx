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
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { TableScroll } from "@/components/ui/table-scroll";
import { Pager } from "@/components/ui/pagination";
import { usePagedRows } from "@/components/ui/use-paged-rows";
import { formatDateTime } from "@/lib/utils";
import { EMAIL_KIND_LABEL, type ClientEmailKind } from "@/lib/email-log";

export type EnvioRow = {
  id: string;
  kind: string;
  subject: string | null;
  recipients: string[];
  recipient_count: number;
  created_at: string;
  account_name: string | null;
  rep_name: string | null;
};

const ALL = "_all";

const KIND_VARIANT: Record<string, "default" | "accent" | "success" | "warning" | "muted"> = {
  portafolio: "default",
  estado_cuenta: "warning",
  promocion: "accent",
  requisitos: "muted",
  muestra: "success",
  cobranza: "warning",
  pedido: "default",
};

export function EnviosClient({ rows }: { rows: EnvioRow[] }) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState(ALL);
  const [rep, setRep] = useState(ALL);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const reps = useMemo(
    () => Array.from(new Set(rows.map((r) => r.rep_name).filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b)),
    [rows],
  );
  const kinds = useMemo(() => Array.from(new Set(rows.map((r) => r.kind))).sort(), [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (kind !== ALL && r.kind !== kind) return false;
      if (rep !== ALL && r.rep_name !== rep) return false;
      if (from && r.created_at.slice(0, 10) < from) return false;
      if (to && r.created_at.slice(0, 10) > to) return false;
      if (
        q &&
        !(r.account_name ?? "").toLowerCase().includes(q) &&
        !(r.subject ?? "").toLowerCase().includes(q) &&
        !r.recipients.some((e) => e.toLowerCase().includes(q))
      )
        return false;
      return true;
    });
  }, [rows, query, kind, rep, from, to]);

  const { paged, page, pageCount, setPage, total } = usePagedRows(filtered);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por cliente, asunto o correo…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={kind} onValueChange={setKind}>
          <SelectTrigger className="sm:w-48">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos los tipos</SelectItem>
            {kinds.map((k) => (
              <SelectItem key={k} value={k}>
                {EMAIL_KIND_LABEL[k as ClientEmailKind] ?? k}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={rep} onValueChange={setRep}>
          <SelectTrigger className="sm:w-48">
            <SelectValue placeholder="Vendedor" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos los vendedores</SelectItem>
            {reps.map((r) => (
              <SelectItem key={r} value={r}>
                {r}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-1.5 text-sm">
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-[9.5rem]" />
          <span className="text-muted-foreground">→</span>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-[9.5rem]" />
        </div>
      </div>

      <div className="text-xs text-muted-foreground">
        {filtered.length} de {rows.length} envíos
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="Sin envíos"
          description={
            rows.length === 0
              ? "Aún no se ha registrado ningún envío a clientes."
              : "Ajusta los filtros."
          }
        />
      ) : (
        <TableScroll>
          <table className="min-w-full text-sm">
            <thead className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">Tipo</th>
                <th className="px-4 py-3">Destinatarios</th>
                <th className="px-4 py-3">Vendedor</th>
              </tr>
            </thead>
            <tbody>
              {paged.map((r) => (
                <tr key={r.id} className="border-b last:border-b-0 hover:bg-muted/30">
                  <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                    {formatDateTime(r.created_at)}
                  </td>
                  <td className="px-4 py-3 font-medium">{r.account_name ?? "— (correos sueltos)"}</td>
                  <td className="px-4 py-3">
                    <Badge variant={KIND_VARIANT[r.kind] ?? "muted"}>
                      {EMAIL_KIND_LABEL[r.kind as ClientEmailKind] ?? r.kind}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {r.recipients.length <= 1
                      ? r.recipients[0] ?? `${r.recipient_count}`
                      : `${r.recipients[0]} +${r.recipients.length - 1}`}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{r.rep_name ?? "—"}</td>
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
