// POST /api/cartera/conciliacion/[statementId]/match
// Genera SUGERENCIAS de conciliación para los abonos sin conciliar del estado.
//   1. Heurística determinista (monto exacto / suma / # cliente o nombre en concepto).
//   2. Para los abonos ambiguos con cliente probable, pregunta a Claude (server).
// Persiste la sugerencia en cada transacción (estado 'sugerido' + matched_account_id).
// NUNCA aplica pagos: eso es exclusivo de /confirm con confirmación humana.
//
// Auth: admin o contador.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRep } from "@/lib/auth";
import { canSeeFinance } from "@/lib/modules";
import { heuristicMatch, type AccountOpenInvoices } from "@/lib/bank/match";
import { suggestReconciliation, type OpenInvoiceForMatch } from "@/lib/anthropic";
import type { ReconcileSuggestion } from "@/lib/bank/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MAX_CLAUDE_CALLS = 25; // tope de costo por corrida

export async function POST(_req: Request, { params }: { params: { statementId: string } }) {
  const rep = await getCurrentRep();
  if (!rep) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!canSeeFinance(rep.role)) {
    return NextResponse.json({ error: "Solo admin o contador pueden conciliar" }, { status: 403 });
  }

  const supabase = createClient();

  // Abonos pendientes (no conciliados ni ignorados) del estado.
  const { data: txns, error: txErr } = await supabase
    .from("bank_transactions")
    .select("id, txn_date, description, reference, amount, kind, estado_conciliacion")
    .eq("bank_statement_id", params.statementId)
    .eq("kind", "abono")
    .in("estado_conciliacion", ["sin_conciliar", "sugerido"])
    .order("row_index");
  if (txErr) return NextResponse.json({ error: txErr.message }, { status: 500 });
  if (!txns?.length) return NextResponse.json({ ok: true, suggested: 0, claude: 0 });

  // Universo de facturas abiertas + cuentas.
  const [{ data: invoices }, { data: accounts }] = await Promise.all([
    supabase
      .from("invoices")
      .select("id, invoice_number, invoice_date, due_date, balance, account_id")
      .neq("status", "cancelada")
      .gt("balance", 0)
      .range(0, 49999),
    supabase.from("accounts").select("id, business_name, client_number").range(0, 49999),
  ]);

  const acctMeta = new Map(
    (accounts ?? []).map((a) => [a.id, { name: a.business_name as string, client_number: a.client_number as string | null }]),
  );
  const byAccount = new Map<string, OpenInvoiceForMatch[]>();
  for (const inv of invoices ?? []) {
    const list = byAccount.get(inv.account_id) ?? [];
    list.push({
      invoice_id: inv.id,
      invoice_number: inv.invoice_number,
      invoice_date: inv.invoice_date,
      due_date: inv.due_date,
      balance: Number(inv.balance ?? 0),
    });
    byAccount.set(inv.account_id, list);
  }
  const accountList: AccountOpenInvoices[] = Array.from(byAccount.entries()).map(([id, invs]) => ({
    account_id: id,
    account_name: acctMeta.get(id)?.name ?? "(cuenta)",
    client_number: acctMeta.get(id)?.client_number ?? null,
    invoices: invs,
  }));

  let suggested = 0;
  let claudeCalls = 0;
  const results: { id: string; suggestion: ReconcileSuggestion }[] = [];

  for (const t of txns) {
    const txn = {
      date: t.txn_date as string | null,
      description: (t.description as string) ?? "",
      reference: (t.reference as string | null) ?? null,
      amount: Number(t.amount ?? 0),
    };
    const { suggestion, ambiguousAccount } = heuristicMatch(txn, accountList);

    let finalSuggestion = suggestion;
    // Ambiguo con cliente probable → Claude decide (con tope de llamadas).
    if (!suggestion.candidates.length && ambiguousAccount && claudeCalls < MAX_CLAUDE_CALLS) {
      claudeCalls++;
      try {
        const cs = await suggestReconciliation({
          txn,
          account_id: ambiguousAccount.account_id,
          account_name: ambiguousAccount.account_name,
          invoices: ambiguousAccount.invoices,
        });
        if (cs.candidates.length) finalSuggestion = cs;
      } catch {
        // Si Claude falla, conservamos la sugerencia heurística (baja confianza).
      }
    }

    const estado = finalSuggestion.candidates.length ? "sugerido" : "sin_conciliar";
    await supabase
      .from("bank_transactions")
      .update({
        estado_conciliacion: estado,
        matched_account_id: finalSuggestion.account_id,
        suggestion: finalSuggestion,
      })
      .eq("id", t.id);
    if (estado === "sugerido") suggested++;
    results.push({ id: t.id as string, suggestion: finalSuggestion });
  }

  return NextResponse.json({ ok: true, total: txns.length, suggested, claude: claudeCalls, results });
}
