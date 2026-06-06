import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, FileDown } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { RegisterPaymentDialog } from "@/components/cartera/RegisterPaymentDialog";
import { SemaforoBadge } from "@/components/cartera/SemaforoBadge";
import { EnviarRecordatorioButton } from "@/components/cartera/EnviarRecordatorioButton";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { Invoice, Payment } from "@/types/database";

function ageInDays(date: string | null) {
  if (!date) return null;
  return Math.floor((Date.now() - new Date(date).getTime()) / 86400000);
}

const invoiceStatusVariant: Record<string, "success" | "warning" | "danger" | "muted"> = {
  pagada: "success",
  pendiente: "warning",
  pagada_parcial: "warning",
  vencida: "danger",
  cancelada: "muted",
};

export default async function EstadoCuentaPage({
  params,
}: {
  params: { accountId: string };
}) {
  const supabase = createClient();

  const { data: account } = await supabase
    .from("accounts")
    .select("id, business_name, region, fiscal_name, rfc")
    .eq("id", params.accountId)
    .single();
  if (!account) notFound();

  const [{ data: invoices }, { data: payments }, { data: balance }] =
    await Promise.all([
      supabase
        .from("invoices")
        .select("*")
        .eq("account_id", params.accountId)
        .neq("status", "cancelada")
        .order("invoice_date", { ascending: false }),
      supabase
        .from("payments")
        .select("*")
        .eq("account_id", params.accountId)
        .order("payment_date", { ascending: false }),
      supabase
        .from("v_account_balance")
        .select("*")
        .eq("account_id", params.accountId)
        .single(),
    ]);

  const inv = (invoices ?? []) as Invoice[];
  const pays = (payments ?? []) as Payment[];
  const openInvoices = inv
    .filter((i) => (i.balance ?? 0) > 0)
    .map((i) => ({ id: i.id, invoice_number: i.invoice_number, balance: i.balance }));

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm">
          <Link href="/cartera">
            <ArrowLeft className="mr-1 h-4 w-4" /> Cartera
          </Link>
        </Button>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border bg-card p-6 brand-shadow">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="font-display text-2xl sm:text-3xl">{account.business_name}</h1>
            <SemaforoBadge
              saldoPendiente={balance?.saldo_pendiente ?? 0}
              saldoVencido={balance?.saldo_vencido ?? 0}
              diasVencido={balance?.dias_vencido}
            />
          </div>
          <p className="text-sm text-muted-foreground">
            {[account.region, account.fiscal_name, account.rfc].filter(Boolean).join(" · ")}
          </p>
          <Link
            href={`/cuentas/${account.id}`}
            className="text-sm text-brand-carmesi hover:underline"
          >
            Ver cuenta
          </Link>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <a href={`/api/cartera/${account.id}/pdf`} target="_blank" rel="noreferrer">
              <FileDown className="mr-1 h-4 w-4" /> Estado de cuenta PDF
            </a>
          </Button>
          {(balance?.saldo_pendiente ?? 0) > 0 && (
            <EnviarRecordatorioButton accountId={account.id} />
          )}
          <RegisterPaymentDialog accountId={account.id} openInvoices={openInvoices} />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Facturado" value={formatCurrency(balance?.total_facturado)} />
        <Stat label="Pagado" value={formatCurrency(balance?.total_pagado)} />
        <Stat label="Pendiente" value={formatCurrency(balance?.saldo_pendiente)} accent />
        <Stat label="Vencido" value={formatCurrency(balance?.saldo_vencido)} danger />
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="border-b px-6 py-3 font-display text-lg">Facturas</div>
          {inv.length === 0 ? (
            <div className="p-6">
              <EmptyState title="Sin facturas" description="Importa o registra facturas para este cliente." />
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
                {inv.map((i) => {
                  const age = ageInDays(i.invoice_date);
                  const overdue = i.due_date && new Date(i.due_date) < new Date() && (i.balance ?? 0) > 0;
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
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="border-b px-6 py-3 font-display text-lg">Pagos</div>
          {pays.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">Sin pagos registrados.</div>
          ) : (
            <table className="min-w-full text-sm">
              <thead className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-4 py-3">Método</th>
                  <th className="px-4 py-3">Referencia</th>
                  <th className="px-4 py-3">Notas</th>
                  <th className="px-4 py-3 text-right">Monto</th>
                </tr>
              </thead>
              <tbody>
                {pays.map((p) => (
                  <tr key={p.id} className="border-b last:border-b-0">
                    <td className="px-4 py-3 text-muted-foreground">{formatDate(p.payment_date)}</td>
                    <td className="px-4 py-3 capitalize">{p.method ?? "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{p.reference ?? "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{p.notes ?? "—"}</td>
                    <td className="px-4 py-3 text-right font-medium">{formatCurrency(p.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
  danger,
}: {
  label: string;
  value: string;
  accent?: boolean;
  danger?: boolean;
}) {
  return (
    <Card>
      <CardContent className="space-y-1 p-4">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className={`font-display text-xl ${danger ? "text-red-600" : accent ? "text-brand-carmesi" : ""}`}>
          {value}
        </div>
      </CardContent>
    </Card>
  );
}
