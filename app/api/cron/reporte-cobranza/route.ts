// GET /api/cron/reporte-cobranza — Vercel Cron (lunes).
//
// Manda el reporte semanal de cobranza:
//   · Resumen general (toda la cartera vencida, agrupada por vendedor) a
//     Pedidos (PEDIDOS_EMAIL) y Contabilidad (CONTABILIDAD_EMAIL).
//   · A cada vendedor activo, SOLO su cartera vencida, con los clientes de
//     crédito suspendido hasta arriba.
//
// Corre con service-role (sin sesión). Seguridad: si CRON_SECRET está
// configurado en Vercel, exige Authorization: Bearer <CRON_SECRET> (Vercel lo
// inyecta automáticamente) — mismo patrón que /api/cron/datos-faltantes.
//
// Parámetros de prueba (para validar sin esperar al lunes):
//   ?dry=1           → NO envía nada; devuelve el plan de envío y el HTML.
//   ?test=a@b.com    → manda TODO a esa dirección con el asunto prefijado
//                      [PRUEBA]; nadie más recibe nada.
//   ?solo=general    → solo el resumen general (omite a los vendedores).
//   ?solo=vendedores → solo los correos por vendedor.

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ejecutarReporteSemanal } from "@/lib/reporte-cobranza-semanal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const url = new URL(req.url);
  const test = url.searchParams.get("test")?.trim() || null;
  if (test && !test.includes("@")) {
    return NextResponse.json({ error: "El parámetro test debe ser un correo válido." }, { status: 400 });
  }
  const soloParam = url.searchParams.get("solo");
  const solo = soloParam === "general" || soloParam === "vendedores" ? soloParam : null;

  try {
    const resultado = await ejecutarReporteSemanal(supabaseAdmin(), {
      dry: url.searchParams.get("dry") === "1",
      test,
      solo,
    });
    return NextResponse.json(resultado, { status: resultado.ok ? 200 : 502 });
  } catch (e) {
    // Falla de lectura: preferimos NO mandar nada antes que mandar un reporte
    // vacío que se lea como "todo al corriente".
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error al armar el reporte" },
      { status: 500 },
    );
  }
}
