// POST /api/cartera/[accountId]/cobranza/draft  { channel: "email" | "whatsapp" }
//
// Genera el BORRADOR de cobranza: el LLM redacta solo la prosa (tono adaptado a
// los días de atraso) y el código adjunta las cifras reales. No envía ni
// registra nada — eso es una acción separada (/registrar).

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRep } from "@/lib/auth";
import { canSeeFinance } from "@/lib/modules";
import { getCobranzaData, renderFactsHtml, renderFactsText } from "@/lib/cobranza-data";
import { generateCollectionMessage } from "@/lib/anthropic";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: { accountId: string } }) {
  const rep = await getCurrentRep();
  if (!rep) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!canSeeFinance(rep.role)) {
    return NextResponse.json({ error: "Solo cobranza (admin/contador)." }, { status: 403 });
  }

  let body: { channel?: unknown };
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const channel = body.channel === "whatsapp" ? "whatsapp" : "email";

  const supabase = createClient();
  const r = await getCobranzaData(supabase, params.accountId);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  const d = r.data;

  try {
    const { subject, body: prose } = await generateCollectionMessage({
      cliente: d.cliente,
      tono: d.tono,
      channel,
      numFacturas: d.invoices.length,
      diasVencido: d.dias_vencido,
    });

    return NextResponse.json({
      channel,
      tono: d.tono,
      suspendido: d.suspendido,
      cliente: d.cliente,
      subject,
      body: prose,
      factsHtml: renderFactsHtml(d),
      factsText: renderFactsText(d),
      emails: d.emails,
      whatsapp: d.whatsapp,
      saldo_vencido: d.saldo_vencido,
      dias_vencido: d.dias_vencido,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error al generar el mensaje.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
