// POST /api/cuentas/[id]/next-best-action
// Genera el resumen "Next Best Action" de una cuenta con el LLM, a partir de
// hechos calculados server-side (cartera, qué compra, tendencia, churn,
// cross-sell). Solo datos de esa cuenta. La RLS restringe a admin o al vendedor
// dueño; no ejecuta ninguna acción.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRep } from "@/lib/auth";
import { loadAccountFacts } from "@/lib/account-intel";
import { generateNextBestAction } from "@/lib/anthropic";
import { CHURN_LABEL } from "@/lib/churn";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const money = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(n);
const monthShort = (p: string) =>
  new Date(p).toLocaleDateString("es-MX", { month: "short" });

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const rep = await getCurrentRep();
  if (!rep) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const supabase = createClient();

  // La RLS ya restringe accounts; confirmamos acceso (si no la ve, 404).
  const { data: account } = await supabase
    .from("accounts")
    .select("id, business_name, fiscal_name")
    .eq("id", params.id)
    .maybeSingle();
  if (!account) return NextResponse.json({ error: "Cuenta no encontrada." }, { status: 404 });

  const facts = await loadAccountFacts(supabase, params.id);

  const tendencia =
    facts.trend.length
      ? facts.trend.map((t) => `${monthShort(t.period)} ${money(t.amount)}`).join(" · ")
      : "Sin facturación mensual registrada.";

  try {
    const out = await generateNextBestAction({
      cliente: account.fiscal_name || account.business_name,
      churnLabel: CHURN_LABEL[facts.churn.status],
      churnReason: facts.churn.reason,
      saldoPendiente: money(facts.cartera.saldo_pendiente),
      saldoVencido: money(facts.cartera.saldo_vencido),
      diasVencido: facts.cartera.dias_vencido,
      topProductos: facts.topProducts.map((p) => p.nombre),
      recomendaciones: facts.recommendations.map((r) => r.nombre),
      tendencia,
    });
    return NextResponse.json({ ...out });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error al generar el resumen.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
