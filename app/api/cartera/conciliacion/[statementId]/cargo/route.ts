// POST /api/cartera/conciliacion/[statementId]/cargo
// Etiqueta un cargo con su categoría de bodega (renta/mantenimiento) y aprende
// la regla (firma+monto) para auto-etiquetar el mismo gasto el próximo mes.
// Body: { transaction_id, categoria: string | null }  (null = quitar etiqueta)
//
// Auth: admin o contador.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRep } from "@/lib/auth";
import { canSeeFinance } from "@/lib/modules";
import { isBodegaCategoria, cargoMatchKey } from "@/lib/bank/bodegas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, { params: _params }: { params: { statementId: string } }) {
  const rep = await getCurrentRep();
  if (!rep) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!canSeeFinance(rep.role)) {
    return NextResponse.json({ error: "Solo admin o contador pueden etiquetar" }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as
    | { transaction_id?: string; categoria?: string | null }
    | null;
  if (!body?.transaction_id) {
    return NextResponse.json({ error: "Falta transaction_id" }, { status: 400 });
  }
  const categoria = body.categoria && isBodegaCategoria(body.categoria) ? body.categoria : null;

  const supabase = createClient();

  const { error } = await supabase
    .from("bank_transactions")
    .update({ cargo_categoria: categoria })
    .eq("id", body.transaction_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Aprende la regla solo cuando se asigna una categoría (best-effort).
  if (categoria) {
    try {
      const { data: txn } = await supabase
        .from("bank_transactions")
        .select("description, reference, amount")
        .eq("id", body.transaction_id)
        .single();
      if (txn) {
        const key = cargoMatchKey(
          (txn.description as string) ?? "",
          (txn.reference as string | null) ?? null,
          Number(txn.amount ?? 0),
        );
        await supabase.rpc("learn_cargo_rule", { p_match_key: key, p_categoria: categoria });
      }
    } catch {
      // no rompe el etiquetado si falla el aprendizaje
    }
  }

  return NextResponse.json({ ok: true, categoria });
}
