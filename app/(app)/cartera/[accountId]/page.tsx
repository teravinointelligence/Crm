import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, FileDown } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RegisterPaymentDialog } from "@/components/cartera/RegisterPaymentDialog";
import { SemaforoBadge } from "@/components/cartera/SemaforoBadge";
import { EnviarRecordatorioButton } from "@/components/cartera/EnviarRecordatorioButton";
import { ImportCarteraCuenta } from "@/components/cartera/ImportCarteraCuenta";
import { InvoicesTable } from "@/components/cartera/InvoicesTable";
import { isAdmin } from "@/lib/auth";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { Invoice, Payment } from "@/types/database";

function creditDaysLabel(days: number | null | undefined) {
  if (days == null) return "—";
  if (days === 0) return "Contado";
  return `${days} días`;
}

export default async function EstadoCuentaPage({
  params,
}: {
  params: { accountId: string };
}) {
  const supabase = createClient();
  const admin = await isAdmin();

  const { data: account } = await supabase
    .from("accounts")
    .select("id, business_name, region, fiscal_name, rfc, credit_days")
    .eq("id", params.accountId)
    .single();
  if (!account) notFound();

  const [{ data: invoices }, { data: payments }, { data: balance }, { data: aging }] =
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
      supabase
        .from("v_account_aging")
        .select("bucket_0_30, bucket_31_60, bucket_61_90, bucket_90_plus")
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
            <h1 className="font-display text-3xl">{account.business_name}</h1>
            <SemaforoBadge
              saldoPendiente={balance?.saldo_pendiente ?? 0}
              saldoVencido={balance?.saldo_vencido ?? 0}
              diasVencido={balance?.dias_vencido}
            />
          </div>
          <p className="text-sm text-muted-foreground">
            {[account.region, account.fiscal_name, account.rfc].filter(Boolean).join(" · ")}
          </p>
          <p className="text-sm text-muted-foreground">
            Días de crédito:{" "}
            <span className="font-medium text-foreground">
              {creditDaysLabel(account.credit_days)}
            </span>
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
          {admin && (
            <ImportCarteraCuenta accountId={account.id} businessName={account.business_name} />
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

      {(balance?.saldo_pendiente ?? 0) > 0 && (
        <Card>
          <CardContent className="space-y-2 p-4">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              Antigüedad de saldos
            </div>
            <div className="grid gap-3 sm:grid-cols-4">
              <AgingCell label="0–30 días" value={aging?.bucket_0_30} />
              <AgingCell label="31–60 días" value={aging?.bucket_31_60} warn />
              <AgingCell label="61–90 días" value={aging?.bucket_61_90} warn />
              <AgingCell label="+90 días" value={aging?.bucket_90_plus} danger />
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          <InvoicesTable invoices={inv} />
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

function AgingCell({
  label,
  value,
  warn,
  danger,
}: {
  label: string;
  value: number | null | undefined;
  warn?: boolean;
  danger?: boolean;
}) {
  const amount = Number(value ?? 0);
  return (
    <div className="rounded-md border bg-muted/20 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className={`font-display text-lg ${
          amount <= 0 ? "text-muted-foreground" : danger ? "text-red-600" : warn ? "text-amber-600" : ""
        }`}
      >
        {formatCurrency(amount)}
      </div>
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
