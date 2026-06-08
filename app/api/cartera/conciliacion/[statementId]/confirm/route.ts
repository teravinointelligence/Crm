// POST /api/cartera/conciliacion/[statementId]/confirm
// Acción humana sobre un abono. SOLO aquí se crean pagos.
//   action 'confirm' → reconcile_transaction(): crea payment + allocations y marca conciliado.
//   action 'ignore'  → marca la transacción como ignorada (p.ej. movimiento interno).
//   action 'reset'   → la regresa a sin_conciliar (deshace una sugerencia).
//
// Body: { transaction_id, action, account_id?, allocations?, method?, reference?, notes? }
// allocations: [{ invoice_id, amount }]
//
// Auth: admin o contador.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRep } from "@/lib/auth";
import { canSeeFinance } from "@/lib/modules";
import { payerKeys } from "@/lib/bank/aliases";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  transaction_id: string;
  action: "confirm" | "ignore" | "reset";
  account_id?: string;
  allocations?: { invoice_id: string; amount: number }[];
  method?: string;
  reference?: string | null;
  notes?: string | null;
};

export async function POST(req: Request, { params: _params }: { params: { statementId: string } }) {
  const rep = await getCurrentRep();
  if (!rep) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!canSeeFinance(rep.role)) {
    return NextResponse.json({ error: "Solo admin o contador pueden conciliar" }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body?.transaction_id || !body.action) {
    return NextResponse.json({ error: "Falta transaction_id o action" }, { status: 400 });
  }

  const supabase = createClient();

  if (body.action === "ignore" || body.action === "reset") {
    const { error } = await supabase
      .from("bank_transactions")
      .update({
        estado_conciliacion: body.action === "ignore" ? "ignorado" : "sin_conciliar",
        ...(body.action === "reset" ? { suggestion: null, matched_account_id: null } : {}),
      })
      .eq("id", body.transaction_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  // action === 'confirm'
  if (!body.account_id || !Array.isArray(body.allocations) || body.allocations.length === 0) {
    return NextResponse.json(
      { error: "Para confirmar se requiere account_id y al menos una factura aplicada" },
      { status: 400 },
    );
  }
  const allocations = body.allocations
    .map((a) => ({ invoice_id: a.invoice_id, amount: Math.abs(Number(a.amount) || 0) }))
    .filter((a) => a.invoice_id && a.amount > 0);
  if (!allocations.length) {
    return NextResponse.json({ error: "Las aplicaciones no tienen montos válidos" }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("reconcile_transaction", {
    p_transaction_id: body.transaction_id,
    p_account_id: body.account_id,
    p_allocations: allocations,
    p_method: body.method || "transferencia",
    p_reference: body.reference ?? null,
    p_notes: body.notes ?? "Conciliación bancaria",
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Aprende ordenante → cliente para autosugerir en el futuro (best-effort:
  // si falla, no rompe la conciliación que ya quedó aplicada).
  try {
    const { data: txn } = await supabase
      .from("bank_transactions")
      .select("description, reference")
      .eq("id", body.transaction_id)
      .single();
    if (txn) {
      const keys = payerKeys((txn.description as string) ?? "", (txn.reference as string | null) ?? null);
      for (const k of keys) {
        await supabase.rpc("learn_payer_key", {
          p_kind: k.kind,
          p_key: k.key,
          p_account_id: body.account_id,
          p_source: "aprendido",
        });
      }
    }
  } catch {
    // ignorar fallos del aprendizaje de alias
  }

  return NextResponse.json({ ok: true, payment_id: data });
}
