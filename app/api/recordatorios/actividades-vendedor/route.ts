// POST /api/recordatorios/actividades-vendedor
// Envía un recordatorio individual cuando un vendedor no tiene actividades
// futuras reales en el mes elegido. El servidor vuelve a contar antes de enviar.

import { NextResponse } from "next/server";
import { getCurrentRep } from "@/lib/auth";
import { sendEmail, crmFrom } from "@/lib/email";
import { createClient } from "@/lib/supabase/server";
import {
  activityReminderIdempotencyKey,
  activityReminderWindow,
  buildActivityScheduleReminderEmail,
  normalizeReminderMonth,
  reminderMonthLabel,
} from "@/lib/activity-schedule-reminder";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "https://crm-steel-tau.vercel.app").replace(
  /\/+$/,
  "",
);
const FALLBACK_ADMIN_EMAIL = process.env.RECORDATORIO_CC_EMAIL || "sabrina@teravino.com";

export async function POST(request: Request) {
  const [admin, body] = await Promise.all([
    getCurrentRep(),
    request.json().catch(() => null),
  ]);
  if (!admin) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (admin.role !== "admin") {
    return NextResponse.json(
      { error: "Solo un administrador puede enviar este recordatorio." },
      { status: 403 },
    );
  }

  const repId = typeof body?.repId === "string" ? body.repId.trim() : "";
  const month = normalizeReminderMonth(body?.month);
  if (!repId || !month) {
    return NextResponse.json({ error: "Vendedor o mes no válido." }, { status: 400 });
  }

  const now = new Date();
  const window = activityReminderWindow(month, now);
  if (!window.eligible) {
    return NextResponse.json(
      { error: "No se pueden enviar recordatorios para meses anteriores." },
      { status: 400 },
    );
  }

  const supabase = createClient();
  const [sellerResult, activitiesResult] = await Promise.all([
    supabase
      .from("sales_reps")
      .select("id, full_name, email, active, role")
      .eq("id", repId)
      .eq("role", "rep")
      .eq("active", true)
      .maybeSingle(),
    supabase
      .from("activities")
      .select("id", { count: "exact", head: true })
      .eq("sales_rep_id", repId)
      .neq("status", "cancelada")
      .gte("activity_date", window.startIso)
      .lt("activity_date", window.endIso),
  ]);
  const { data: seller, error: sellerError } = sellerResult;

  if (sellerError) {
    return NextResponse.json({ error: "No se pudo consultar al vendedor." }, { status: 500 });
  }
  if (!seller) {
    return NextResponse.json({ error: "Vendedor activo no encontrado." }, { status: 404 });
  }
  if (!seller.email?.trim()) {
    return NextResponse.json(
      { error: `${seller.full_name} no tiene correo registrado.` },
      { status: 400 },
    );
  }

  const { count, error: activitiesError } = activitiesResult;

  if (activitiesError) {
    return NextResponse.json(
      { error: "No se pudieron verificar las actividades del vendedor." },
      { status: 500 },
    );
  }

  const futureActivities = count ?? 0;
  const monthLabel = reminderMonthLabel(month);
  if (futureActivities > 0) {
    return NextResponse.json(
      {
        error: `${seller.full_name} ya tiene ${futureActivities} ${
          futureActivities === 1 ? "actividad futura registrada" : "actividades futuras registradas"
        } para ${monthLabel}.`,
        futureActivities,
      },
      { status: 409 },
    );
  }

  const adminEmail = admin.email?.trim() || FALLBACK_ADMIN_EMAIL;
  const message = buildActivityScheduleReminderEmail({
    sellerName: seller.full_name,
    sellerId: seller.id,
    month,
    appUrl: APP_URL,
  });

  try {
    const result = await sendEmail({
      from: crmFrom(),
      to: seller.email,
      cc: adminEmail,
      replyTo: adminEmail,
      subject: message.subject,
      html: message.html,
      idempotencyKey: activityReminderIdempotencyKey(repId, month),
    });
    return NextResponse.json({
      ok: true,
      id: result.id,
      sellerName: seller.full_name,
      to: seller.email,
      cc: adminEmail,
      month,
      monthLabel,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo enviar el correo." },
      { status: 502 },
    );
  }
}
