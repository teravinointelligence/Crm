import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, FileDown } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RegisterPaymentDialog } from "@/components/cartera/RegisterPaymentDialog";
import { SemaforoBadge } from "@/components/cartera/SemaforoBadge";
import { RiesgoBadge } from "@/components/cartera/RiesgoBadge";
import { TakeSnapshotButton } from "@/components/cartera/TakeSnapshotButton";
import { EnviarRecordatorioButton } from "@/components/cartera/EnviarRecordatorioButton";
import { RedactarCobranzaButton } from "@/components/cartera/RedactarCobranzaButton";
import { ImportCarteraCuenta } from "@/components/cartera/ImportCarteraCuenta";
import { InvoicesTable } from "@/components/cartera/InvoicesTable";
import { getCurrentRep, isAdmin } from "@/lib/auth";
import { canSeeFinance } from "@/lib/modules";
import { formatCurrency, formatDate } from "@/lib/utils";
import { BUCKET_KEYS, BUCKET_LABEL, pctDelSaldo, resumenVencido } from "@/lib/cartera";
import type { Invoice, Payment } from "@/types/database";
import type { ReconcileSuggestion } from "@/lib/bank/types";

function creditDaysLabel(days: number | null | undefined) {
  if (days == null) return "Por confirmar";
  if (days === 0) return "Contado";
  return `${days} días`;
}

const pct = (n: number) => `${n.toFixed(1)}%`;

export default async function EstadoCuentaPage({
  params,
}: {
  params: { accountId: string };
}) {
  const supabase = createClient();
  const [admin, rep0] = await Promise.all([isAdmin(), getCurrentRep()]);
  const canReconcile = canSeeFinance(rep0?.role);

  const { data: account } = await supabase
    .from("accounts")
    .select(
      "id, business_name, region, city, fiscal_name, rfc, client_number, credit_days, dias_pago, dias_revision, ventana_revision, ventana_suspension, is_legacy, assigned_rep_id",
    )
    .eq("id", params.accountId)
    .single();
  if (!account) notFound();

  const corte = new Date();

  const [
    { data: invoices },
    { data: payments },
    { data: balance },
    { data: aging },
    { data: rep },
    { data: sugeridos },
    { data: snapshots },
  ] = await Promise.all([
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
    supabase.from("v_account_balance").select("*").eq("account_id", params.accountId).single(),
    supabase
      .from("v_account_aging")
      .select("b_1_31, b_32_62, b_63_93, b_94_mas, saldo_total")
      .eq("account_id", params.accountId)
      .single(),
    account.assigned_rep_id
      ? supabase.from("sales_reps").select("full_name").eq("id", account.assigned_rep_id).single()
      : Promise.resolve({ data: null }),
    supabase
      .from("bank_transactions")
      .select(
        "id, txn_date, amount, reference, description, suggestion, bank_statements(bank, account_label)",
      )
      .eq("matched_account_id", params.accountId)
      .eq("estado_conciliacion", "sugerido")
      .eq("kind", "abono"),
    supabase
      .from("client_balance_snapshots")
      .select("fecha_corte, saldo_total, b_1_31, b_32_62, b_63_93, b_94_mas")
      .eq("account_id", params.accountId)
      .order("fecha_corte", { ascending: false })
      .limit(12),
  ]);

  const inv = (invoices ?? []) as Invoice[];
  const pays = (payments ?? []) as Payment[];
  const openInvoices = inv
    .filter((i) => (i.balance ?? 0) > 0)
    .map((i) => ({ id: i.id, invoice_number: i.invoice_number, balance: i.balance }));

  const saldoPendiente = Number(balance?.saldo_pendiente ?? 0);
  // Vencimiento credit-aware (regla 11) calculado desde las facturas — no
  // depende de v_account_balance.dias_vencido (que no existe en prod).
  const { saldoVencido, maxDiasVencido } = resumenVencido(inv, Number(account.credit_days ?? 0), corte);
  const agingTotal = Number(aging?.saldo_total ?? saldoPendiente);

  const pendientes = ((sugeridos ?? []) as PendienteRow[]).map((s) => {
    const sug = (s.suggestion ?? null) as ReconcileSuggestion | null;
    const folios = (sug?.candidates ?? []).map((c) => c.invoice_number).join(", ");
    const bankRel = Array.isArray(s.bank_statements) ? s.bank_statements[0] : s.bank_statements;
    return {
      id: s.id,
      fecha: s.txn_date,
      banco: bankRel?.bank ?? bankRel?.account_label ?? "—",
      referencia: s.reference ?? s.description ?? "—",
      importe: Number(s.amount ?? 0),
      folios: folios || "—",
    };
  });
  const sumSugeridos = pendientes.reduce((acc, p) => acc + p.importe, 0);
  const netoEstimado = saldoPendiente - sumSugeridos;

  const snaps = (snapshots ?? []) as SnapshotRow[];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm">
          <Link href="/cartera">
            <ArrowLeft className="mr-1 h-4 w-4" /> Cartera
          </Link>
        </Button>
      </div>

      {/* Encabezado + Sección 1 — datos del cliente */}
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border bg-card p-6 brand-shadow">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-3xl">{account.business_name}</h1>
            {account.client_number && (
              <span className="text-sm text-muted-foreground">Cliente {account.client_number}</span>
            )}
            <SemaforoBadge
              saldoPendiente={saldoPendiente}
              saldoVencido={saldoVencido}
              diasVencido={maxDiasVencido}
            />
          </div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
            <Dato label="Razón social" value={account.fiscal_name} />
            <Dato label="RFC" value={account.rfc} />
            <Dato label="Vendedor" value={rep?.full_name} />
            <Dato label="Ubicación" value={[account.region, account.city].filter(Boolean).join(" · ")} />
            <Dato label="Días de pago" value={account.dias_pago} />
            <Dato label="Días de revisión" value={account.dias_revision} />
            <Dato label="Crédito" value={creditDaysLabel(account.credit_days)} />
            <Dato label="Corte de cartera" value={formatDate(corte.toISOString())} />
          </dl>
          <Link href={`/cuentas/${account.id}`} className="inline-block text-sm text-brand-carmesi hover:underline">
            Ver cuenta
          </Link>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <a href={`/api/cartera/${account.id}/pdf`} target="_blank" rel="noreferrer">
              <FileDown className="mr-1 h-4 w-4" /> Exportar a PDF
            </a>
          </Button>
          {saldoPendiente > 0 && <EnviarRecordatorioButton accountId={account.id} />}
          {canReconcile && saldoPendiente > 0 && (
            <RedactarCobranzaButton accountId={account.id} clientName={account.business_name} />
          )}
          {canReconcile && <TakeSnapshotButton />}
          {admin && (
            <ImportCarteraCuenta accountId={account.id} businessName={account.business_name} />
          )}
          {/* Aplicar pagos es exclusivo de admin/contador (RLS 0091). */}
          {canReconcile && <RegisterPaymentDialog accountId={account.id} openInvoices={openInvoices} />}
        </div>
      </div>

      {/* Sección 2 — saldo y riesgo */}
      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Facturado" value={formatCurrency(balance?.total_facturado)} />
        <Stat label="Pagado" value={formatCurrency(balance?.total_pagado)} />
        <Stat label="Saldo pendiente" value={formatCurrency(saldoPendiente)} accent />
        <Stat label="Saldo vencido" value={formatCurrency(saldoVencido)} danger />
      </div>
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4">
          <div className="space-y-1">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              Clasificación de riesgo
            </div>
            <RiesgoBadge
              withDetail
              diasVencido={maxDiasVencido}
              saldoVencido={saldoVencido}
              isLegacy={account.is_legacy}
              ventanaRevision={account.ventana_revision}
              ventanaSuspension={account.ventana_suspension}
            />
          </div>
          {sumSugeridos > 0 && (
            <div className="space-y-1 text-right">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                Saldo neto estimado
              </div>
              <div className="font-display text-xl text-amber-700">{formatCurrency(netoEstimado)}</div>
              <div className="text-xs text-muted-foreground">
                estimado · {formatCurrency(sumSugeridos)} en abonos por confirmar
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sección 3 — resumen por antigüedad */}
      {agingTotal > 0 && (
        <Card>
          <CardContent className="space-y-3 p-4">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              Resumen por antigüedad
            </div>
            <table className="min-w-full text-sm">
              <thead className="text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="py-2">Antigüedad</th>
                  <th className="py-2 text-right">Importe</th>
                  <th className="py-2 text-right">% del saldo</th>
                </tr>
              </thead>
              <tbody>
                {BUCKET_KEYS.map((k) => {
                  const val = Number(aging?.[k] ?? 0);
                  return (
                    <tr key={k} className="border-t">
                      <td className="py-2">{BUCKET_LABEL[k]}</td>
                      <td className="py-2 text-right">{formatCurrency(val)}</td>
                      <td className="py-2 text-right text-muted-foreground">
                        {pct(pctDelSaldo(val, agingTotal))}
                      </td>
                    </tr>
                  );
                })}
                <tr className="border-t-2 font-medium">
                  <td className="py-2">Total</td>
                  <td className="py-2 text-right">{formatCurrency(agingTotal)}</td>
                  <td className="py-2 text-right">100%</td>
                </tr>
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* Sección 4 — evolución del saldo por corte */}
      {snaps.length > 0 && (
        <Card>
          <CardContent className="space-y-3 p-4">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              Evolución del saldo (por corte)
            </div>
            <table className="min-w-full text-sm">
              <thead className="text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="py-2">Corte</th>
                  <th className="py-2 text-right">Saldo total</th>
                  <th className="py-2 text-right">1–31</th>
                  <th className="py-2 text-right">32–62</th>
                  <th className="py-2 text-right">63–93</th>
                  <th className="py-2 text-right">94+</th>
                </tr>
              </thead>
              <tbody>
                {snaps.map((s) => (
                  <tr key={s.fecha_corte} className="border-t">
                    <td className="py-2">{formatDate(s.fecha_corte)}</td>
                    <td className="py-2 text-right font-medium">{formatCurrency(s.saldo_total)}</td>
                    <td className="py-2 text-right text-muted-foreground">{formatCurrency(s.b_1_31)}</td>
                    <td className="py-2 text-right text-amber-600">{formatCurrency(s.b_32_62)}</td>
                    <td className="py-2 text-right text-orange-600">{formatCurrency(s.b_63_93)}</td>
                    <td className="py-2 text-right text-red-600">{formatCurrency(s.b_94_mas)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* Sección 5 — abonos pendientes de aplicar */}
      {pendientes.length > 0 && (
        <Card>
          <CardContent className="space-y-3 p-4">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              Abonos detectados pendientes de aplicar
            </div>
            <p className="text-xs text-muted-foreground">
              Depósitos sugeridos desde conciliación que aún no se confirman. Nada se aplica al saldo
              sin confirmación en la cola de conciliación.
            </p>
            <table className="min-w-full text-sm">
              <thead className="text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="py-2">Fecha</th>
                  <th className="py-2">Banco / referencia</th>
                  <th className="py-2">Folios que cubre</th>
                  <th className="py-2 text-right">Importe</th>
                </tr>
              </thead>
              <tbody>
                {pendientes.map((p) => (
                  <tr key={p.id} className="border-t">
                    <td className="py-2 text-muted-foreground">{p.fecha ? formatDate(p.fecha) : "—"}</td>
                    <td className="py-2">{[p.banco, p.referencia].filter((x) => x && x !== "—").join(" · ") || "—"}</td>
                    <td className="py-2 text-muted-foreground">{p.folios}</td>
                    <td className="py-2 text-right font-medium">{formatCurrency(p.importe)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="text-right text-sm">
              <Link href="/cartera/conciliacion" className="text-brand-carmesi hover:underline">
                Ir a conciliación →
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Sección 6 — detalle de facturas */}
      <Card>
        <CardContent className="p-0">
          <InvoicesTable invoices={inv} creditDays={account.credit_days} />
        </CardContent>
      </Card>

      {/* Pagos */}
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

      {/* Notas */}
      <Card>
        <CardContent className="space-y-1 p-4 text-xs text-muted-foreground">
          <div className="uppercase tracking-wide">Notas</div>
          <p>· CONTPAQ guarda el vencimiento = fecha de factura. Para clientes con crédito negociado, los días y el bucket se recalculan con los días pactados.</p>
          <p>· La aplicación de pagos por coincidencia de importe es estimada hasta confirmar en COMPAC.</p>
          <p>· Cuentas legacy/estratégicas (Vernazza, Brew Wines, Eno Vino, Ventas Mostrador) se excluyen de métricas operativas.</p>
        </CardContent>
      </Card>
    </div>
  );
}

type PendienteRow = {
  id: string;
  txn_date: string | null;
  amount: number | null;
  reference: string | null;
  description: string | null;
  suggestion: unknown;
  bank_statements: { bank: string | null; account_label: string | null } | { bank: string | null; account_label: string | null }[] | null;
};

type SnapshotRow = {
  fecha_corte: string;
  saldo_total: number;
  b_1_31: number;
  b_32_62: number;
  b_63_93: number;
  b_94_mas: number;
};

function Dato({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="text-foreground">{value || "—"}</dd>
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
