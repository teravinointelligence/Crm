// POST /api/invitacion/[token] — RSVP público (sin login). Valida el rsvp_token
// y registra la respuesta del invitado. Usa service-role tras validar el token.
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: { token: string } }) {
  let body: { response?: string; decline_reason?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }
  const response = body.response;
  if (response !== "accepted" && response !== "declined") {
    return NextResponse.json({ error: "Respuesta inválida" }, { status: 400 });
  }

  const db = supabaseAdmin();
  const { data: guest } = await db
    .from("event_guests")
    .select("id")
    .eq("rsvp_token", params.token)
    .maybeSingle();
  if (!guest) return NextResponse.json({ error: "Invitación no encontrada" }, { status: 404 });

  const { error } = await db
    .from("event_guests")
    .update({
      confirmation_status: response,
      response_at: new Date().toISOString(),
      decline_reason: response === "declined" ? body.decline_reason?.slice(0, 500) ?? null : null,
    })
    .eq("id", guest.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, response });
}
