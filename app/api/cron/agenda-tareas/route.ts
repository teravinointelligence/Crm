// GET /api/cron/agenda-tareas — Vercel Cron (diario, temprano).
// Arma la agenda de tareas de cada vendedor: seguimiento de prospectos, cobro
// de cartera vencida y rescate de clientes inactivos. Corre con service-role
// (sin sesión) porque tiene que ver la cartera de todo el equipo.
//
// Seguridad: si CRON_SECRET está configurado en Vercel, exige el header
// Authorization: Bearer <CRON_SECRET> (Vercel lo inyecta automáticamente).
// El admin también puede dispararlo a mano desde /actividades/hoy.

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getCurrentRep } from "@/lib/auth";
import { generateRepTasks } from "@/lib/rep-tasks-generate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function authorize(req: Request): Promise<boolean> {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") === `Bearer ${secret}`) return true;
  // Sin secreto configurado (local) o disparo manual: solo admin con sesión.
  const rep = await getCurrentRep().catch(() => null);
  if (rep?.role === "admin") return true;
  return !secret;
}

export async function GET(req: Request) {
  if (!(await authorize(req))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const result = await generateRepTasks(supabaseAdmin());
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export const POST = GET;
