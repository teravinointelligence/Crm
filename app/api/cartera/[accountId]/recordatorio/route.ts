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

export async function POST(req: Request, { params }: { params: { accountId: string } }) {
  const rep = await getCurrentRep();
  if (!rep) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const supabase = createClient();
  const r = await buildRecordatorio(supabase, params.accountId);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });

  // El usuario puede elegir un subconjunto de los correos registrados; si no
  // manda nada, se envía a todos. Sólo se aceptan correos de la lista registrada.
  const body = await req.json().catch(() => ({}));
  const requested = Array.isArray(body?.to)
    ? body.to.filter((x: unknown): x is string => typeof x === "string")
    : null;
  const to = requested ? r.to.filter((email) => requested.includes(email)) : r.to;
  if (to.length === 0) {
    return NextResponse.json(
      { error: "Selecciona al menos un correo para enviar el recordatorio." },
      { status: 400 },
    );
  }

  try {
    const result = await sendEmail({
      to,
      subject: r.subject,
      html: r.html,
      replyTo: cobranzaFrom().replace(/^.*<|>$/g, "").trim() || "cobranza@teravino.com",
    });
    return NextResponse.json({ ok: true, id: result.id, to, estado: r.estado });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error al enviar el correo" },
      { status: 502 },
    );
  }
}
