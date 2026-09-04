// Reporte semanal de cobranza — disparo MANUAL desde el CRM.
// El envío automático vive en /api/cron/reporte-cobranza (lunes); esta ruta es
// la misma lógica pero autenticada por sesión, para previsualizar o mandarlo
// fuera de calendario.
//
//   GET  → vista previa (no envía). Admin y contador.
//   POST → envía. Solo admin. Body opcional:
//            { test?: "a@b.com", solo?: "general" | "vendedores" }
//          Con `test`, TODO se manda a esa dirección (asunto prefijado
//          [PRUEBA]) y ningún vendedor ni contabilidad recibe nada.
//
// Se lee siempre con service-role (tras gatear por rol) para que los números
// del envío manual y los del cron sean idénticos, sin depender de la RLS del
// usuario que dispara.

import { NextResponse } from "next/server";
import { getCurrentRep } from "@/lib/auth";
import { canSeeFinance } from "@/lib/modules";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ejecutarReporteSemanal } from "@/lib/reporte-cobranza-semanal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function normalizaSolo(v: unknown): "general" | "vendedores" | null {
  return v === "general" || v === "vendedores" ? v : null;
}

export async function GET(req: Request) {
  const rep = await getCurrentRep();
  if (!rep) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!canSeeFinance(rep.role)) {
    return NextResponse.json({ error: "No tienes acceso a este reporte." }, { status: 403 });
  }

  const url = new URL(req.url);
  try {
    const resultado = await ejecutarReporteSemanal(supabaseAdmin(), {
      dry: true,
      solo: normalizaSolo(url.searchParams.get("solo")),
    });
    return NextResponse.json(resultado);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error al armar el reporte" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  const rep = await getCurrentRep();
  if (!rep) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (rep.role !== "admin") {
    return NextResponse.json(
      { error: "Solo un administrador puede enviar el reporte semanal." },
      { status: 403 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as { test?: unknown; solo?: unknown };
  const test = typeof body.test === "string" ? body.test.trim() : "";
  if (test && !test.includes("@")) {
    return NextResponse.json({ error: "El correo de prueba no es válido." }, { status: 400 });
  }

  try {
    const resultado = await ejecutarReporteSemanal(supabaseAdmin(), {
      test: test || null,
      solo: normalizaSolo(body.solo),
    });
    return NextResponse.json(resultado, { status: resultado.ok ? 200 : 502 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error al armar el reporte" },
      { status: 500 },
    );
  }
}
