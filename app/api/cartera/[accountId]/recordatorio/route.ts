// /api/cartera/[accountId]/recordatorio
//
// GET  → vista previa (borrador) del correo de cobranza: { to, subject, html }.
//        No envía nada; sirve para revisar antes de autorizar el envío.
// POST → envía el recordatorio de pago al contacto principal de la cuenta
//        desde cobranza@teravino.com vía Resend.
//
// Auth: admin o el vendedor asignado a la cuenta (la RLS restringe accounts).

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRep } from "@/lib/auth";
import { sendEmail, cobranzaFrom } from "@/lib/email";
import { logClientEmail } from "@/lib/email-log";
import { buildRecordatorio } from "@/lib/cobranza-email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { accountId: string } }) {
  const rep = await getCurrentRep();
  if (!rep) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const supabase = createClient();
  const r = await buildRecordatorio(supabase, params.accountId);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });

  return NextResponse.json({ to: r.to, subject: r.subject, html: r.html, estado: r.estado });
}

export async function POST(_req: Request, { params }: { params: { accountId: string } }) {
  const rep = await getCurrentRep();
  if (!rep) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const supabase = createClient();
  const r = await buildRecordatorio(supabase, params.accountId);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });

  try {
    const result = await sendEmail({
      to: r.to,
      subject: r.subject,
      html: r.html,
      replyTo: cobranzaFrom().replace(/^.*<|>$/g, "").trim() || "cobranza@teravino.com",
    });
    await logClientEmail(supabase, {
      accountId: params.accountId,
      kind: "estado_cuenta",
      subject: r.subject,
      recipients: r.to,
      resendId: result.id,
      sentBy: rep.id,
    });
    return NextResponse.json({ ok: true, id: result.id, to: r.to, estado: r.estado });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error al enviar el correo" },
      { status: 502 },
    );
  }
}
