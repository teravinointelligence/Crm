"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { LayoutGrid, List, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AccountStatusBadge } from "./AccountStatusBadge";
import { EmptyState } from "@/components/ui/empty-state";
import {
  ACCOUNT_STATUSES,
  ACCOUNT_TYPES,
  REGIONS,
  type Account,
  type SalesRep,
} from "@/types/database";

type AccountRow = Account & { sales_reps: { full_name: string | null } | null };

type Props = {
  accounts: AccountRow[];
  reps: SalesRep[];
  isAdmin: boolean;
};

const ALL = "_all";

export function AccountsListClient({ accounts, reps, isAdmin }: Props) {
  const [view, setView] = useState<"table" | "cards">("table");
  const [query, setQuery] = useState("");
  const [region, setRegion] = useState<string>(ALL);
  const [type, setType] = useState<string>(ALL);
  const [status, setStatus] = useState<string>(ALL);
  const [rep, setRep] = useState<string>(ALL);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return accounts.filter((a) => {
      if (region !== ALL && a.region !== region) return false;
      if (type !== ALL && a.account_type !== type) return false;
      if (status !== ALL && a.status !== status) return false;
      if (rep !== ALL && a.assigned_rep_id !== rep) return false;
      if (
        q &&
        !a.business_name.toLowerCase().includes(q) &&
        !(a.rfc ?? "").toLowerCase().includes(q) &&
        !(a.city ?? "").toLowerCase().includes(q)
      )
        return false;
      return true;
    });
  }, [accounts, query, region, type, status, rep]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre, RFC, ciudad…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={region} onValueChange={setRegion}>
          <SelectTrigger className="sm:w-48">
            <SelectValue placeholder="Región" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todas las regiones</SelectItem>
            {REGIONS.map((r) => (
              <SelectItem key={r} value={r}>
                {r}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={type} onValueChange={setType}>
          <SelectTrigger className="sm:w-40">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos los tipos</SelectItem>
            {ACCOUNT_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="sm:w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos</SelectItem>
            {ACCOUNT_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {isAdmin && (
          <Select value={rep} onValueChange={setRep}>
            <SelectTrigger className="sm:w-48">
              <SelectValue placeholder="Vendedor" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos los vendedores</SelectItem>
              {reps.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.full_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <div className="ml-auto flex gap-1 rounded-md border bg-card p-1">
          <Button
            type="button"
            variant={view === "table" ? "default" : "ghost"}
            size="sm"
            onClick={() => setView("table")}
            className="h-8 w-8 p-0"
          >
            <List className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant={view === "cards" ? "default" : "ghost"}
            size="sm"
            onClick={() => setView("cards")}
            className="h-8 w-8 p-0"
          >
            <LayoutGrid className="h-4 w-4" />
          </Button>
        </div>
        <Button asChild>
          <Link href="/cuentas/nueva">
            <Plus className="mr-1 h-4 w-4" />
            Nueva cuenta
          </Link>
        </Button>
      </div>

      <div className="text-xs text-muted-foreground">
        {filtered.length} de {accounts.length} cuentas
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="Sin cuentas aún"
          description="Crea tu primera cuenta HORECA o limpia los filtros."
          action={
            <Button asChild className="mt-2">
              <Link href="/cuentas/nueva">Crear cuenta</Link>
            </Button>
          }
        />
      ) : view === "table" ? (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="min-w-full text-sm">
            <thead className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Negocio</th>
                <th className="px-4 py-3">Tipo</th>
                <th className="px-4 py-3">Región</th>
                <th className="px-4 py-3">Tier</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Vendedor</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => (
                <tr key={a.id} className="border-b last:border-b-0 hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <Link
                      href={`/cuentas/${a.id}`}
                      className="font-medium text-foreground hover:text-brand-carmesi"
                    >
                      {a.business_name}
                    </Link>
                    {a.city && (
                      <div className="text-xs text-muted-foreground">{a.city}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {a.account_type ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {a.region ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    {a.price_tier === "+10" ? (
                      <Badge variant="accent">+10%</Badge>
                    ) : (
                      <Badge variant="muted">Base</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <AccountStatusBadge status={a.status} />
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {a.sales_reps?.full_name ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((a) => (
            <Link key={a.id} href={`/cuentas/${a.id}`}>
              <Card className="h-full transition hover:border-brand-carmesi">
                <CardContent className="space-y-2 p-5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-display text-lg">{a.business_name}</h3>
                      <p className="text-xs text-muted-foreground">
                        {[a.account_type, a.region, a.city]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    {a.price_tier === "+10" && (
                      <Badge variant="accent">+10%</Badge>
                    )}
                  </div>
                  <div className="flex items-center justify-between">
                    <AccountStatusBadge status={a.status} />
                    <span className="text-xs text-muted-foreground">
                      {a.sales_reps?.full_name ?? "—"}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
