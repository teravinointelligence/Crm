// GET /api/cron/inventarios-drive — Vercel Cron (diario).
// Lee la carpeta de Google Drive donde el equipo sube los cortes de inventario
// que baja de CONTPAQi, toma el más reciente de cada almacén y actualiza
// product_warehouse_stock. El trigger de la migración 0081 recalcula solo el
// products.stock_quantity. Corre con service-role (sin sesión).
//
// Seguridad: a diferencia de los otros crons (que solo mandan correos y se
// auto-protegen SI hay CRON_SECRET), este ESCRIBE existencias, así que exige
// el secreto siempre. Sin CRON_SECRET configurado responde 503 en vez de
// quedar abierto: el repo es público y la ruta sería un endpoint de escritura
// sin autenticar.

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { runInventarioDriveSync } from "@/lib/inventario-drive-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      {
        error:
          "CRON_SECRET no está configurado. Este cron escribe inventario y no " +
          "puede correr sin autenticación.",
      },
      { status: 503 },
    );
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const summary = await runInventarioDriveSync(supabaseAdmin());
    return NextResponse.json({ ok: true, ...summary });
  } catch (e) {
    // Falla de configuración o de Drive: se reporta con 500 para que quede en
    // los logs de Vercel en vez de pasar como una corrida vacía y silenciosa.
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
