// POST /api/cartera/[accountId]/cobranza/registrar
//   { channel, tono, recipient, subject, body }
//
// Acción de ENVÍO, separada del borrador y con confirmación explícita en la UI.
// SIEMPRE registra el contacto en la bitácora (collection_contacts).
//
// El envío real de correo por Resend está detrás del flag COBRANZA_ENVIO_REAL:
//   • flag apagado (default): solo registra; la UI abre mailto: / wa.me con el
//     texto prellenado para que la persona lo mande desde su propio cliente.
//   • flag encendido: además envía el correo por Resend (sent_via = 'resend').
// Las cifras se re-arman aquí desde la BD: el registro y el correo siempre
// llevan los importes reales, aunque se haya editado la prosa.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRep } from "@/lib/auth";
import { canSeeFinance } from "@/lib/modules";
import { getCobranzaData, renderFactsHtml, renderFactsText, type Tono } from "@/lib/cobranza-data";
import { sendEmail, cobranzaFrom } from "@/lib/email";
import { logClientEmail } from "@/lib/email-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TONOS: Tono[] = ["amable", "firme", "formal"];

function proseToHtml(prose: string): string {
  const paragraphs = prose
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 12px;">${p.replace(/\n/g, "<br/>")}</p>`)
    .join("");
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:0 auto;color:#222;">
    <h2 style="color:#7a1220;margin:0 0 12px;">TERAVINO — Cobranza</h2>
    ${paragraphs}`;
}

export async function POST(req: Request, { params }: { params: { accountId: string } }) {
  const rep = await getCurrentRep();
  if (!rep) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!canSeeFinance(rep.role)) {
    return NextResponse.json({ error: "Solo cobranza (admin/contador)." }, { status: 403 });
  }

  let body: {
    channel?: unknown;
    tono?: unknown;
    recipient?: unknown;
    subject?: unknown;
    body?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const channel = body.channel === "whatsapp" ? "whatsapp" : "email";
  const tono = TONOS.includes(body.tono as Tono) ? (body.tono as Tono) : null;
  const recipient = body.recipient ? String(body.recipient).trim() : null;
  const subject = body.subject ? String(body.subject).trim() : null;
  const prose = body.body ? String(body.body) : "";
  if (!prose.trim()) {
    return NextResponse.json({ error: "El mensaje está vacío." }, { status: 400 });
  }

  const supabase = createClient();
  // Foto de cifras al momento del contacto (siempre reales).
  const r = await getCobranzaData(supabase, params.accountId);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  const d = r.data;

  const flagOn = process.env.COBRANZA_ENVIO_REAL === "true";
  let sent_via: "mailto" | "whatsapp" | "resend";
  let sent = false;

  if (flagOn && channel === "email" && recipient) {
    try {
      await sendEmail({
        to: recipient,
        subject: subject || `Estado de cuenta TERAVINO — ${d.cliente}`,
        html: proseToHtml(prose) + renderFactsHtml(d) + "</div>",
        replyTo: cobranzaFrom().replace(/^.*<|>$/g, "").trim() || "cobranza@teravino.com",
      });
      sent_via = "resend";
      sent = true;
      await logClientEmail(supabase, {
        accountId: params.accountId,
        kind: "cobranza",
        subject: subject || `Estado de cuenta TERAVINO — ${d.cliente}`,
        recipients: recipient,
        sentBy: rep.id,
      });
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Error al enviar el correo." },
        { status: 502 },
      );
    }
  } else {
    sent_via = channel === "email" ? "mailto" : "whatsapp";
  }

  // El texto que se registra incluye la prosa aprobada + las cifras reales.
  const fullText = `${prose.trim()}\n\n${renderFactsText(d)}`;

  const { error: logErr } = await supabase.from("collection_contacts").insert({
    account_id: params.accountId,
    channel,
    tono,
    recipient,
    subject: channel === "email" ? subject : null,
    body: fullText,
    status: "enviado",
    sent_via,
    saldo_vencido: d.saldo_vencido,
    dias_vencido: d.dias_vencido,
    created_by: rep.id,
  });
  if (logErr) {
    return NextResponse.json({ error: `No se pudo registrar: ${logErr.message}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true, sent, sent_via });
}
