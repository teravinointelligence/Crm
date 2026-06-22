// POST /api/eventos/[id]/invitar — envía invitaciones por correo a los invitados
// seleccionados (o a todos los pendientes). Genera un rsvp_token por invitado y
// manda el link público de confirmación. Admin y vendedores (rep).
import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { getCurrentRep } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { sendEmail, ventasFrom } from "@/lib/email";
import { logClientEmail } from "@/lib/email-log";
import { formatDateTime } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "https://crm-steel-tau.vercel.app").replace(
  /\/+$/,
  "",
);
const VINO = "#7a1220";

type GuestRow = {
  id: string;
  account_id: string | null;
  guest_name: string | null;
  guest_email: string | null;
  rsvp_token: string | null;
  invitation_status: string;
  contact: { full_name: string | null; email: string | null } | null;
};

function invitationHtml(opts: {
  guestName: string;
  eventName: string;
  when: string;
  venue: string | null;
  city: string;
  url: string;
}) {
  return `
  <div style="font-family:Arial,Helvetica,sans-serif;color:#222;max-width:560px;margin:0 auto">
    <div style="font-size:22px;letter-spacing:4px;color:${VINO};font-weight:700;margin-bottom:16px">TERAVINO</div>
    <p>Hola ${opts.guestName || ""},</p>
    <p>Nos encantaría contar con tu presencia en:</p>
    <h2 style="color:${VINO};margin:8px 0">${opts.eventName}</h2>
    <p style="margin:4px 0"><strong>Cuándo:</strong> ${opts.when}</p>
    ${opts.venue ? `<p style="margin:4px 0"><strong>Dónde:</strong> ${opts.venue}</p>` : ""}
    <p style="margin:4px 0"><strong>Ciudad:</strong> ${opts.city}</p>
    <p style="margin:20px 0">
      <a href="${opts.url}" style="display:inline-block;background:${VINO};color:#fff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 24px;border-radius:8px">Confirmar asistencia</a>
    </p>
    <p style="font-size:13px;color:#666">Si el botón no funciona, copia este enlace:<br>${opts.url}</p>
  </div>`;
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const rep = await getCurrentRep();
  if (!rep) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const supabase = createClient();

  const { data: ev } = await supabase
    .from("events")
    .select("id, name, start_date, venue_name, city")
    .eq("id", params.id)
    .maybeSingle();
  if (!ev) return NextResponse.json({ error: "Evento no encontrado" }, { status: 404 });

  let guestIds: string[] | null = null;
  try {
    const body = await req.json();
    if (Array.isArray(body?.guestIds)) guestIds = body.guestIds;
  } catch {
    // sin body: enviar a todos los pendientes
  }

  let q = supabase
    .from("event_guests")
    .select(
      "id, account_id, guest_name, guest_email, rsvp_token, invitation_status, contact:contact_id(full_name, email)",
    )
    .eq("event_id", params.id);
  if (guestIds && guestIds.length) q = q.in("id", guestIds);
  const { data: guestsRaw } = await q;
  const guests = (guestsRaw ?? []) as unknown as GuestRow[];

  const when = formatDateTime(ev.start_date);
  let sent = 0;
  const skipped: string[] = [];

  for (const g of guests) {
    const email = (g.guest_email || g.contact?.email || "").trim();
    const name = g.guest_name || g.contact?.full_name || "";
    if (!email || !email.includes("@")) {
      skipped.push(name || g.id);
      continue;
    }
    const token = g.rsvp_token || crypto.randomBytes(24).toString("base64url");
    const url = `${APP_URL}/invitacion/${token}`;
    try {
      const res = await sendEmail({
        to: email,
        subject: `Invitación: ${ev.name}`,
        html: invitationHtml({
          guestName: name,
          eventName: ev.name,
          when,
          venue: ev.venue_name,
          city: ev.city,
          url,
        }),
        from: ventasFrom(),
      });
      await supabase
        .from("event_guests")
        .update({
          rsvp_token: token,
          invitation_status: "sent",
          invitation_sent_at: new Date().toISOString(),
        })
        .eq("id", g.id);
      await logClientEmail(supabase, {
        accountId: g.account_id,
        kind: "invitacion",
        subject: `Invitación: ${ev.name}`,
        recipients: email,
        refTable: "events",
        refId: ev.id,
        resendId: res.id,
        sentBy: rep.id,
      });
      sent++;
    } catch (e) {
      skipped.push(`${name || g.id} (error)`);
    }
  }

  return NextResponse.json({ ok: true, sent, skipped });
}
