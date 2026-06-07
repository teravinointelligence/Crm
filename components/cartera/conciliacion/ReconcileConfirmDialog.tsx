"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Search } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency, formatDate } from "@/lib/utils";
import { PAYMENT_METHODS } from "@/types/database";
import type { ReconcileSuggestion } from "@/lib/bank/types";

type Txn = {
  id: string;
  amount: number;
  description: string;
  reference: string | null;
  txn_date: string | null;
};

type OpenInvoice = {
  id: string;
  invoice_number: string;
  invoice_date: string;
  due_date: string | null;
  balance: number;
};

export function ReconcileConfirmDialog({
  statementId,
  txn,
  suggestion,
  trigger,
}: {
  statementId: string;
  txn: Txn;
  suggestion: ReconcileSuggestion | null;
  trigger: React.ReactNode;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const [accountId, setAccountId] = useState<string | null>(suggestion?.account_id ?? null);
  const [accountName, setAccountName] = useState<string | null>(suggestion?.account_name ?? null);
  const [invoices, setInvoices] = useState<OpenInvoice[]>([]);
  const [alloc, setAlloc] = useState<Record<string, number>>({});
  const [method, setMethod] = useState("transferencia");
  const [reference, setReference] = useState(txn.reference ?? "");

  // Búsqueda de cuenta (para cambiar la sugerida o conciliar manualmente).
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ id: string; business_name: string }[]>([]);

  const loadInvoices = async (acc: string, prefill?: ReconcileSuggestion["candidates"]) => {
    const { data } = await supabase
      .from("invoices")
      .select("id, invoice_number, invoice_date, due_date, balance")
      .eq("account_id", acc)
      .neq("status", "cancelada")
      .gt("balance", 0)
      .order("due_date", { ascending: true });
    const list = (data ?? []) as OpenInvoice[];
    setInvoices(list);
    const next: Record<string, number> = {};
    if (prefill?.length) {
      for (const c of prefill) {
        const inv = list.find((i) => i.id === c.invoice_id);
        if (inv) next[inv.id] = Math.min(c.amount, inv.balance);
      }
    }
    setAlloc(next);
  };

  // Al abrir, si hay cuenta sugerida, carga sus facturas y prellena.
  useEffect(() => {
    if (open && accountId) {
      loadInvoices(accountId, suggestion?.candidates);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const searchAccounts = async () => {
    if (query.trim().length < 2) return;
    const { data } = await supabase
      .from("accounts")
      .select("id, business_name")
      .ilike("business_name", `%${query.trim()}%`)
      .limit(10);
    setResults((data ?? []) as { id: string; business_name: string }[]);
  };

  const pickAccount = async (id: string, name: string) => {
    setAccountId(id);
    setAccountName(name);
    setResults([]);
    setQuery("");
    await loadInvoices(id);
  };

  const toggleInvoice = (inv: OpenInvoice) => {
    setAlloc((prev) => {
      const next = { ...prev };
      if (next[inv.id] != null) delete next[inv.id];
      else {
        const used = Object.values(next).reduce((s, v) => s + v, 0);
        const remaining = Math.max(0, txn.amount - used);
        next[inv.id] = Math.min(inv.balance, remaining || inv.balance);
      }
      return next;
    });
  };

  const totalAlloc = Object.values(alloc).reduce((s, v) => s + (Number(v) || 0), 0);
  const overAmount = totalAlloc > txn.amount + 0.01;
  const canConfirm = accountId && totalAlloc > 0 && !overAmount && !busy;

  const confirm = async () => {
    if (!accountId) return;
    setBusy(true);
    try {
      const allocations = Object.entries(alloc)
        .filter(([, v]) => Number(v) > 0)
        .map(([invoice_id, amount]) => ({ invoice_id, amount: Number(amount) }));
      const res = await fetch(`/api/cartera/conciliacion/${statementId}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transaction_id: txn.id,
          action: "confirm",
          account_id: accountId,
          allocations,
          method,
          reference: reference || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Error al conciliar");
      toast.success("Abono conciliado y pago aplicado");
      setOpen(false);
      router.refresh();
    } catch (err) {
      toast.error("No pudimos conciliar", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Conciliar abono — {formatCurrency(txn.amount)}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div className="rounded-md border bg-muted/30 p-3">
            <div className="text-muted-foreground">{txn.txn_date ? formatDate(txn.txn_date) : "Sin fecha"}</div>
            <div className="font-medium">{txn.description}</div>
            {txn.reference && <div className="text-xs text-muted-foreground">Ref: {txn.reference}</div>}
          </div>

          {suggestion?.reason && (
            <div className="rounded-md border border-brand-carmesi/30 bg-accent/10 p-3 text-xs">
              <span className="font-medium">Sugerencia ({suggestion.confidence}):</span> {suggestion.reason}
            </div>
          )}

          {/* Cuenta */}
          <div className="space-y-2">
            <Label>Cliente</Label>
            <div className="flex items-center justify-between gap-2 rounded-md border p-2">
              <span className={accountName ? "font-medium" : "text-muted-foreground"}>
                {accountName ?? "Sin cliente seleccionado"}
              </span>
            </div>
            <div className="flex gap-2">
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), searchAccounts())}
                placeholder="Buscar otro cliente por nombre…"
              />
              <Button type="button" variant="outline" size="icon" onClick={searchAccounts}>
                <Search className="h-4 w-4" />
              </Button>
            </div>
            {results.length > 0 && (
              <div className="max-h-40 overflow-y-auto rounded-md border">
                {results.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => pickAccount(r.id, r.business_name)}
                    className="block w-full px-3 py-2 text-left hover:bg-muted/50"
                  >
                    {r.business_name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Facturas */}
          {accountId && (
            <div className="space-y-2">
              <Label>Aplicar a facturas</Label>
              {invoices.length === 0 ? (
                <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                  Este cliente no tiene facturas abiertas.
                </p>
              ) : (
                <div className="max-h-56 overflow-y-auto rounded-md border">
                  <table className="min-w-full text-xs">
                    <thead className="border-b bg-muted/50 text-left uppercase text-muted-foreground">
                      <tr>
                        <th className="px-2 py-1.5"></th>
                        <th className="px-2 py-1.5">Folio</th>
                        <th className="px-2 py-1.5">Vence</th>
                        <th className="px-2 py-1.5 text-right">Saldo</th>
                        <th className="px-2 py-1.5 text-right">Aplicar</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoices.map((inv) => {
                        const checked = alloc[inv.id] != null;
                        return (
                          <tr key={inv.id} className="border-b last:border-b-0">
                            <td className="px-2 py-1.5">
                              <input type="checkbox" checked={checked} onChange={() => toggleInvoice(inv)} />
                            </td>
                            <td className="px-2 py-1.5 font-mono">{inv.invoice_number}</td>
                            <td className="px-2 py-1.5 text-muted-foreground">{inv.due_date ? formatDate(inv.due_date) : "—"}</td>
                            <td className="px-2 py-1.5 text-right">{formatCurrency(inv.balance)}</td>
                            <td className="px-2 py-1.5 text-right">
                              {checked ? (
                                <Input
                                  type="number"
                                  step="0.01"
                                  min={0}
                                  max={inv.balance}
                                  value={alloc[inv.id]}
                                  onChange={(e) =>
                                    setAlloc((prev) => ({ ...prev, [inv.id]: Number(e.target.value) }))
                                  }
                                  className="h-7 w-28 text-right"
                                />
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              <div className={`flex justify-between rounded-md p-2 text-xs ${overAmount ? "bg-red-50 text-red-700" : "bg-muted/40"}`}>
                <span>Aplicado: <strong>{formatCurrency(totalAlloc)}</strong> de {formatCurrency(txn.amount)}</span>
                <span>{overAmount ? "Excede el abono" : `Sin aplicar: ${formatCurrency(txn.amount - totalAlloc)}`}</span>
              </div>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="method">Método</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger id="method"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ref">Referencia</Label>
              <Input id="ref" value={reference} onChange={(e) => setReference(e.target.value)} />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancelar</Button>
            <Button onClick={confirm} disabled={!canConfirm}>
              {busy ? "Aplicando…" : "Confirmar y aplicar pago"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
