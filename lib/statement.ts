// Construcción de los datos del estado de cuenta (StatementData) a partir de
// una cuenta. Se extrajo de la ruta del PDF privado para poder reusarlo desde
// el acceso público por token (Fase 2 del asistente de pedidos). Es agnóstico
// del cliente: recibe un SupabaseClient, ya sea con sesión (RLS) o service-role.
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { StatementData } from "@/components/cartera/StatementPdf";
import { clasificarRiesgo } from "@/lib/cobranza";
import { resumenVencido } from "@/lib/cartera";
import type { ReconcileSuggestion } from "@/lib/bank/types";

/**
 * Reúne todos los datos del estado de cuenta de una cuenta. Devuelve null si
 * la cuenta no existe (o el cliente no tiene permiso de verla bajo RLS).
 */
export async function buildStatementData(
  supabase: SupabaseClient,
  accountId: string,
): Promise<StatementData | null> {
  const { data: account } = await supabase
    .from("accounts")
    .select(
      "business_name, fiscal_name, rfc, region, city, client_number, credit_days, dias_pago, dias_revision, ventana_revision, ventana_suspension, is_legacy, assigned_rep_id",
    )
    .eq("id", accountId)
    .single();
  if (!account) return null;

  const [
    { data: invoices },
    { data: payments },
    { data: balance },
    { data: aging },
    { data: rep },
    { data: sugeridos },
  ] = await Promise.all([
    supabase
      .from("invoices")
      .select("invoice_number, invoice_date, due_date, total, total_paid, balance, status")
      .eq("account_id", accountId)
      .neq("status", "cancelada")
      .order("invoice_date", { ascending: true }),
    supabase
      .from("payments")
      .select("payment_date, amount, method, reference")
      .eq("account_id", accountId)
      .order("payment_date", { ascending: true }),
    supabase.from("v_account_balance").select("*").eq("account_id", accountId).single(),
    supabase
      .from("v_account_aging")
      .select("b_1_31, b_32_62, b_63_93, b_94_mas, saldo_total")
      .eq("account_id", accountId)
      .single(),
    account.assigned_rep_id
      ? supabase.from("sales_reps").select("full_name").eq("id", account.assigned_rep_id).single()
      : Promise.resolve({ data: null }),
    supabase
      .from("bank_transactions")
      .select("id, txn_date, amount, reference, description, suggestion, bank_statements(bank, account_label)")
      .eq("matched_account_id", accountId)
      .eq("estado_conciliacion", "sugerido")
      .eq("kind", "abono"),
  ]);

  const saldoPendiente = Number(balance?.saldo_pendiente ?? 0);
  const creditDaysNum = Number(account.credit_days ?? 0);
  const { saldoVencido, maxDiasVencido } = resumenVencido(
    ((invoices ?? []) as { invoice_date: string | null; balance: number | null }[]),
    creditDaysNum,
    new Date(),
  );

  const riesgo = clasificarRiesgo({
    diasVencido: maxDiasVencido,
    saldoVencido,
    isLegacy: account.is_legacy as boolean | null,
    ventanaRevision: account.ventana_revision as number | null,
    ventanaSuspension: account.ventana_suspension as number | null,
  });

  const pendientes = ((sugeridos ?? []) as Record<string, unknown>[]).map((sgst) => {
    const sug = (sgst.suggestion ?? null) as ReconcileSuggestion | null;
    const bankRel = Array.isArray(sgst.bank_statements) ? sgst.bank_statements[0] : sgst.bank_statements;
    const b = bankRel as { bank: string | null; account_label: string | null } | null;
    return {
      fecha: sgst.txn_date ? String(sgst.txn_date) : null,
      banco: b?.bank ?? b?.account_label ?? "—",
      referencia: (sgst.reference as string) ?? (sgst.description as string) ?? "—",
      folios: (sug?.candidates ?? []).map((c) => c.invoice_number).join(", ") || "—",
      importe: Number(sgst.amount ?? 0),
    };
  });
  const sumSugeridos = pendientes.reduce((acc, p) => acc + p.importe, 0);

  const creditoLabel =
    account.credit_days == null
      ? "Por confirmar"
      : account.credit_days === 0
        ? "Contado"
        : `${account.credit_days} días`;

  return {
    account: {
      business_name: account.business_name as string,
      fiscal_name: (account.fiscal_name as string) ?? null,
      rfc: (account.rfc as string) ?? null,
      region: (account.region as string) ?? null,
      city: (account.city as string) ?? null,
      client_number: (account.client_number as string) ?? null,
      vendedor: rep?.full_name ?? null,
      dias_pago: (account.dias_pago as string) ?? null,
      dias_revision: (account.dias_revision as string) ?? null,
      credito: creditoLabel,
    },
    generatedAt: new Date().toISOString(),
    creditDays: Number(account.credit_days ?? 0),
    riesgo: riesgo.clase,
    totals: {
      facturado: Number(balance?.total_facturado ?? 0),
      pagado: Number(balance?.total_pagado ?? 0),
      pendiente: saldoPendiente,
      vencido: saldoVencido,
      netoEstimado: sumSugeridos > 0 ? saldoPendiente - sumSugeridos : null,
    },
    aging: aging
      ? {
          b_1_31: Number(aging.b_1_31 ?? 0),
          b_32_62: Number(aging.b_32_62 ?? 0),
          b_63_93: Number(aging.b_63_93 ?? 0),
          b_94_mas: Number(aging.b_94_mas ?? 0),
          saldo_total: Number(aging.saldo_total ?? 0),
        }
      : null,
    pendientes,
    invoices: ((invoices ?? []) as never[]).map((i: Record<string, unknown>) => ({
      invoice_number: String(i.invoice_number),
      invoice_date: String(i.invoice_date),
      due_date: i.due_date ? String(i.due_date) : null,
      total: Number(i.total ?? 0),
      total_paid: Number(i.total_paid ?? 0),
      balance: Number(i.balance ?? 0),
      status: String(i.status ?? ""),
    })),
    payments: ((payments ?? []) as never[]).map((p: Record<string, unknown>) => ({
      payment_date: String(p.payment_date),
      amount: Number(p.amount ?? 0),
      method: p.method ? String(p.method) : null,
      reference: p.reference ? String(p.reference) : null,
    })),
  };
}
