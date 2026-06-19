// /api/samples/[id]/cancelar  POST
//
// Cancela una solicitud de muestra.
// • Vendedor: solo puede cancelar sus propias solicitudes en borrador/enviada.
// • Admin: puede cancelar cualquier solicitud en borrador/enviada/aprobada.
//   Al cancelar una aprobada llama a cancel_approved_sample() que revierte
//   los movimientos del banco.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRep } from "@/lib/auth";
import { sendEmail, ventasFrom } from "@/lib/email";
import { logClientEmail } from "@/lib/email-log";
import { buildMuestraCancelEmail } from "@/lib/muestra-email";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const rep = await getCurrentRep();
  if (!rep) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const supabase = createClient();

  const { data: req, error: fetchErr } = await supabase
    .from("sample_requests")
    .select("id, status, sales_rep_id")
    .eq("id", params.id)
    .single();

  if (fetchErr || !req) return NextResponse.json({ error: "Solicitud no encontrada" }, { status: 404 });

  const isAdmin = rep.role === "admin";
  const isOwner = req.sales_rep_id === rep.id;

  // Vendedor solo puede cancelar sus propias solicitudes en borrador/enviada
  if (!isAdmin && !isOwner) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }
  if (!isAdmin && !["borrador", "enviada"].includes(req.status ?? "")) {
    return NextResponse.json({ error: "Solo puedes cancelar solicitudes en borrador o enviada" }, { status: 403 });
  }
  if (!["borrador", "enviada", "aprobada"].includes(req.status ?? "")) {
    return NextResponse.json({ error: "No se puede cancelar en el estado actual" }, { status: 400 });
  }

  const prevStatus = req.status ?? "";

  if (prevStatus === "aprobada") {
    // Aprobada → RPC para revertir los movimientos del banco
    const { error: rpcErr } = await supabase.rpc("cancel_approved_sample", {
      p_request_id: params.id,
      p_cancelled_by: rep.id,
    });
    if (rpcErr) return NextResponse.json({ error: rpcErr.message }, { status: 500 });
  } else {
    // borrador / enviada → simple update
    const { error: updateErr } = await supabase
      .from("sample_requests")
      .update({
        status: "cancelada",
        cancelled_at: new Date().toISOString(),
        cancelled_by: rep.id,
      })
      .eq("id", params.id);
    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  // Aviso de cancelación a pedidos@ con copia al vendedor solicitante, solo si
  // la solicitud ya se había enviado/aprobado (un borrador nunca llegó a pedidos).
  // Best-effort: la cancelación ya está hecha; un fallo de correo no la revierte.
  if (["enviada", "aprobada"].includes(prevStatus)) {
    try {
      const mail = await buildMuestraCancelEmail(supabase, params.id);
      if (mail.ok) {
        const cc = mail.repEmail && mail.repEmail !== mail.to ? mail.repEmail : undefined;
        const result = await sendEmail({
          to: mail.to,
          from: ventasFrom(),
          replyTo: rep.email ?? undefined,
          cc,
          subject: mail.subject,
          html: mail.html,
        });
        const { data: sr } = await supabase
          .from("sample_requests")
          .select("account_id")
          .eq("id", params.id)
          .maybeSingle();
        await logClientEmail(supabase, {
          accountId: (sr as { account_id?: string } | null)?.account_id ?? null,
          kind: "muestra",
          subject: mail.subject,
          recipients: [mail.to, ...(cc ? [cc] : [])].join(", "),
          resendId: result.id,
          sentBy: rep.id,
        });
      }
    } catch (e) {
      console.error("No se pudo enviar el correo de cancelación de muestras:", e);
    }
  }

  return NextResponse.json({ ok: true });
}
