import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRep } from "@/lib/auth";
import { sendEmail, ventasFrom } from "@/lib/email";
import { logClientEmail } from "@/lib/email-log";
import { buildMuestraCancelEmail } from "@/lib/muestra-email";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const rep = await getCurrentRep();
  if (!rep) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (rep.role !== "admin") return NextResponse.json({ error: "Solo administración" }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { approve?: boolean; notes?: string };
  if (typeof body.approve !== "boolean") return NextResponse.json({ error: "Decisión inválida" }, { status: 400 });
  const supabase = createClient();
  const { error } = await supabase.rpc("decide_sample_cancellation", {
    p_request_id: params.id, p_approve: body.approve,
    p_notes: typeof body.notes === "string" ? body.notes.trim().slice(0, 2000) : null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 409 });

  if (body.approve) {
    try {
      const mail = await buildMuestraCancelEmail(supabase, params.id);
      if (mail.ok) {
        const cc = mail.repEmail && mail.repEmail !== mail.to ? mail.repEmail : undefined;
        const result = await sendEmail({ to: mail.to, from: ventasFrom(), replyTo: rep.email ?? undefined,
          cc, subject: mail.subject, html: mail.html });
        const { data: sample } = await supabase.from("sample_requests").select("account_id").eq("id", params.id).maybeSingle();
        await logClientEmail(supabase, { accountId: sample?.account_id ?? null, kind: "muestra",
          subject: mail.subject, recipients: [mail.to, ...(cc ? [cc] : [])].join(", "),
          resendId: result.id, sentBy: rep.id });
      }
    } catch (mailError) {
      console.error("La cancelación se aprobó, pero falló el aviso por correo:", mailError);
    }
  }
  return NextResponse.json({ ok: true });
}
