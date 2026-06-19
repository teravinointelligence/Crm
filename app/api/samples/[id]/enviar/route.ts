// /api/samples/[id]/enviar
//
// GET  → vista previa (borrador) del correo de muestras: { to, subject, requestNumber }.
//        Sirve para precargar el destinatario (contacto del cliente) antes de enviar.
// POST → envía la solicitud de muestras al destinatario indicado (o, si no se manda
//        ninguno, al contacto principal de la cuenta) desde ventas@teravino.com vía
//        Resend, con el PDF de la solicitud adjunto.
//
// Auth: admin o el vendedor dueño de la solicitud (la RLS restringe sample_requests).

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRep } from "@/lib/auth";
import { sendEmail, ventasFrom } from "@/lib/email";
import { logClientEmail } from "@/lib/email-log";
import { buildMuestraEmail } from "@/lib/muestra-email";
import { renderSamplePdf } from "@/lib/sample-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const rep = await getCurrentRep();
  if (!rep) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const supabase = createClient();
  const r = await buildMuestraEmail(supabase, params.id);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });

  return NextResponse.json({ to: r.to, subject: r.subject, requestNumber: r.requestNumber });
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const rep = await getCurrentRep();
  if (!rep) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const supabase = createClient();
  const built = await buildMuestraEmail(supabase, params.id);
  if (!built.ok) return NextResponse.json({ error: built.error }, { status: built.status });

  const body = (await req.json().catch(() => ({}))) as { to?: string };
  const to = (body.to ?? built.to).trim();
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return NextResponse.json(
      { error: "Indica un correo destino válido (el cliente no tiene contacto con email)." },
      { status: 400 },
    );
  }

  const pdf = await renderSamplePdf(supabase, params.id);
  if (!pdf) return NextResponse.json({ error: "No se pudo generar el PDF" }, { status: 500 });

  try {
    // Copia al vendedor que solicitó (si su correo no es ya el destinatario).
    const cc = built.repEmail && built.repEmail !== to ? built.repEmail : undefined;
    const result = await sendEmail({
      to,
      from: ventasFrom(),
      replyTo: rep.email ?? undefined,
      cc,
      subject: built.subject,
      html: built.html,
      attachments: [
        { filename: `${pdf.requestNumber}.pdf`, content: pdf.buffer.toString("base64") },
      ],
    });
    const { data: sr } = await supabase
      .from("sample_requests")
      .select("account_id")
      .eq("id", params.id)
      .maybeSingle();
    await logClientEmail(supabase, {
      accountId: (sr as { account_id?: string } | null)?.account_id ?? null,
      kind: "muestra",
      subject: built.subject,
      recipients: to,
      resendId: result.id,
      sentBy: rep.id,
    });
    return NextResponse.json({ ok: true, id: result.id, to });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error al enviar el correo" },
      { status: 502 },
    );
  }
}
