// GET /api/cron/reasignar-inactivas — Vercel Cron (diario).
// Barre las cuentas asignadas sin actividad: avisa al vendedor a los 50 días
// ("te quedan 10 días") y, pasado el margen, regresa la cuenta al pool y
// notifica al vendedor y a admin. Corre con service-role (sin sesión).
//
// Seguridad: si CRON_SECRET está configurado, exige Authorization: Bearer <secret>.

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { runReassignmentSweep } from "@/lib/reasignacion-inactivas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const result = await runReassignmentSweep(supabaseAdmin());
  return NextResponse.json({ ok: true, ...result });
}
