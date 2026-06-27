// POST /api/cuentas/reasignacion/run — corre el barrido de reasignación a mano
// (botón "Ejecutar ahora" del panel admin). Body opcional { dryRun: boolean }
// para simular sin escribir ni enviar. Verifica que el solicitante sea admin y
// corre con service-role.

import { NextResponse } from "next/server";
import { getCurrentRep } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { runReassignmentSweep } from "@/lib/reasignacion-inactivas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: Request) {
  const rep = await getCurrentRep();
  if (rep?.role !== "admin") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  let dryRun = false;
  let send = true;
  try {
    const body = await req.json();
    dryRun = !!body?.dryRun;
    if (body?.send === false) send = false;
  } catch {
    // sin body → corrida real con correos
  }

  const result = await runReassignmentSweep(supabaseAdmin(), { dryRun, send });
  return NextResponse.json({ ok: true, ...result });
}
