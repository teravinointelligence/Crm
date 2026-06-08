// GET /api/cron/datos-faltantes — Vercel Cron (semanal).
// Manda a cada vendedor activo un resumen de SUS cuentas SIN NINGÚN CONTACTO
// (sin contacto no se puede cobrar). Corre con service-role (sin sesión).
//
// Seguridad: si CRON_SECRET está configurado en Vercel, exige el header
// Authorization: Bearer <CRON_SECRET> (Vercel lo inyecta automáticamente).

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { buildMissingDataDigest } from "@/lib/missing-data-email";
import { sendEmail, ventasFrom } from "@/lib/email";
import type { MissingFlag } from "@/lib/missing-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const SOLO_SIN_CONTACTOS: MissingFlag[] = ["sin_contactos"];

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
    const draft = await buildMissingDataDigest(supabase, r.id, SOLO_SIN_CONTACTOS);
    if (!draft.ok) {
      saltados++; // sin pendientes o sin email
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
