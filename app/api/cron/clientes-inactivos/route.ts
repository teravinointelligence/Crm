// GET /api/cron/clientes-inactivos — Vercel Cron (semanal).
// Manda a cada vendedor activo un recordatorio de SUS clientes sin actividad
// registrada en los últimos 15 días (incluye los que nunca tuvieron actividad).
// Corre con service-role (sin sesión).
//
// Seguridad: si CRON_SECRET está configurado en Vercel, exige el header
// Authorization: Bearer <CRON_SECRET> (Vercel lo inyecta automáticamente).

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { buildInactiveAccountsDigest, DEFAULT_INACTIVE_DAYS } from "@/lib/inactive-accounts-email";
import { sendEmail, ventasFrom } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const supabase = supabaseAdmin();
  const { data: reps } = await supabase
    .from("sales_reps")
    .select("id, email, active")
    .eq("active", true);

  let enviados = 0;
  let saltados = 0;
  const errores: string[] = [];

  for (const r of (reps ?? []) as { id: string; email: string | null }[]) {
    const draft = await buildInactiveAccountsDigest(supabase, r.id, DEFAULT_INACTIVE_DAYS);
    if (!draft.ok) {
      saltados++; // sin clientes inactivos o sin email
      continue;
    }
    try {
      await sendEmail({ to: draft.to, subject: draft.subject, html: draft.html, from: ventasFrom() });
      enviados++;
    } catch (e) {
      errores.push(`${r.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return NextResponse.json({ ok: true, enviados, saltados, errores });
}
