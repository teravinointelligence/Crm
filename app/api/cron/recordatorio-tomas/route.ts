// GET /api/cron/recordatorio-tomas — Vercel Cron (semanal, lunes 8am Mazatlán).
// Manda a cada vendedor (de Base44) un recordatorio de sus clientes con
// consignación activa sin toma de inventario en los últimos 14 días.
//
// Seguridad: si CRON_SECRET está configurado en Vercel, exige el header
// Authorization: Bearer <CRON_SECRET> (Vercel lo inyecta automáticamente).

import { NextResponse } from "next/server";
import { loadTomasGroups, renderTomasDigest, DEFAULT_TOMA_DAYS } from "@/lib/tomas-inventario-email";
import { sendEmail, ventasFrom } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const groups = await loadTomasGroups(DEFAULT_TOMA_DAYS);

  let enviados = 0;
  let saltados = 0;
  const errores: string[] = [];

  for (const g of groups) {
    if (!g.email || !g.activo || !g.items.length) {
      saltados++; // sin email, inactivo o sin pendientes
      continue;
    }
    const { subject, html } = renderTomasDigest(g.vendedorNombre, g.items, DEFAULT_TOMA_DAYS);
    try {
      await sendEmail({ to: g.email, subject, html, from: ventasFrom() });
      enviados++;
    } catch (e) {
      errores.push(`${g.vendedorId}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return NextResponse.json({ ok: true, enviados, saltados, errores });
}
