// GET /api/cron/recordatorio-eventos — Vercel Cron (diario, 8am Mazatlán).
// Recordatorios INTERNOS al coordinador del evento (y admins de respaldo):
//   1) Cierre de confirmaciones cerca (confirmation_deadline en <=2 días) y
//      todavía hay invitados sin responder → recordatorio + deadline_reminder_sent.
//   2) Evento dentro de <=2 días → resumen (confirmados/pendientes) +
//      event_reminder_sent.
// No manda nada a clientes; solo avisa al equipo. Se auto-protege con CRON_SECRET.

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendEmail, ventasFrom } from "@/lib/email";
import { formatDateTime } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const VINO = "#7a1220";
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "https://crm-steel-tau.vercel.app").replace(
  /\/+$/,
  "",
);
const WINDOW_MS = 2 * 24 * 60 * 60 * 1000;

type Reason = { kind: "deadline" | "event"; text: string };

function renderHtml(eventName: string, eventId: string, reasons: Reason[]) {
  const items = reasons.map((r) => `<li style="margin:6px 0">${r.text}</li>`).join("");
  return `
  <div style="font-family:Arial,Helvetica,sans-serif;color:#222;max-width:560px;margin:0 auto">
    <div style="font-size:22px;letter-spacing:4px;color:${VINO};font-weight:700;margin-bottom:16px">TERAVINO</div>
    <p>Recordatorio del evento:</p>
    <h2 style="color:${VINO};margin:8px 0">${eventName}</h2>
    <ul style="padding-left:18px">${items}</ul>
    <p style="margin:20px 0">
      <a href="${APP_URL}/eventos/${eventId}" style="display:inline-block;background:${VINO};color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:10px 20px;border-radius:6px">Abrir el evento</a>
    </p>
  </div>`;
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const db = supabaseAdmin();
  const now = Date.now();
  const windowEnd = new Date(now + WINDOW_MS).toISOString();
  const nowIso = new Date(now).toISOString();

  // Correos de admins (respaldo cuando el evento no tiene coordinador).
  const { data: admins } = await db
    .from("sales_reps")
    .select("email")
    .eq("role", "admin")
    .eq("active", true)
    .not("email", "is", null);
  const adminEmails = (admins ?? []).map((a: any) => a.email).filter(Boolean);

  const { data: events } = await db
    .from("events")
    .select(
      "id, name, start_date, confirmation_deadline, status, deadline_reminder_sent, event_reminder_sent, coordinator:coordinator_id(email)",
    )
    .in("status", ["upcoming", "confirmed"])
    .or(`and(confirmation_deadline.gte.${nowIso},confirmation_deadline.lte.${windowEnd}),and(start_date.gte.${nowIso},start_date.lte.${windowEnd})`);

  let enviados = 0;
  let saltados = 0;
  const errores: string[] = [];

  for (const ev of (events ?? []) as any[]) {
    const reasons: Reason[] = [];
    const flags: Record<string, boolean> = {};

    // 1) Cierre de confirmaciones
    if (
      !ev.deadline_reminder_sent &&
      ev.confirmation_deadline &&
      new Date(ev.confirmation_deadline).getTime() >= now &&
      new Date(ev.confirmation_deadline).getTime() <= now + WINDOW_MS
    ) {
      const { count: pendientes } = await db
        .from("event_guests")
        .select("id", { count: "exact", head: true })
        .eq("event_id", ev.id)
        .eq("confirmation_status", "pending");
      if ((pendientes ?? 0) > 0) {
        reasons.push({
          kind: "deadline",
          text: `Cierre de confirmaciones el ${formatDateTime(ev.confirmation_deadline)} — quedan <strong>${pendientes}</strong> invitado(s) sin responder.`,
        });
        flags.deadline_reminder_sent = true;
      }
    }

    // 2) Evento próximo (<=2 días)
    if (
      !ev.event_reminder_sent &&
      new Date(ev.start_date).getTime() >= now &&
      new Date(ev.start_date).getTime() <= now + WINDOW_MS
    ) {
      const { count: confirmados } = await db
        .from("event_guests")
        .select("id", { count: "exact", head: true })
        .eq("event_id", ev.id)
        .eq("confirmation_status", "accepted");
      const { count: total } = await db
        .from("event_guests")
        .select("id", { count: "exact", head: true })
        .eq("event_id", ev.id);
      reasons.push({
        kind: "event",
        text: `El evento es el ${formatDateTime(ev.start_date)} — <strong>${confirmados ?? 0}</strong> confirmados de ${total ?? 0} invitados.`,
      });
      flags.event_reminder_sent = true;
    }

    if (reasons.length === 0) {
      saltados++;
      continue;
    }

    const to = [ev.coordinator?.email, ...adminEmails].filter(Boolean) as string[];
    const recipients = [...new Set(to)];
    if (recipients.length === 0) {
      saltados++;
      continue;
    }

    try {
      await sendEmail({
        to: recipients,
        subject: `Recordatorio: ${ev.name}`,
        html: renderHtml(ev.name, ev.id, reasons),
        from: ventasFrom(),
      });
      await db.from("events").update(flags).eq("id", ev.id);
      enviados++;
    } catch (e) {
      errores.push(`${ev.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return NextResponse.json({ ok: true, enviados, saltados, errores });
}
