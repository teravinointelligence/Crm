// GET /api/cron/clientes-inactivos — Vercel Cron (semanal).
// En una sola corrida manda a cada vendedor activo DOS recordatorios:
//  1. Clientes sin actividad registrada en los últimos 15 días (incluye los que
//     nunca tuvieron actividad).
//  2. Clientes que dejaron de pedir: ya facturaron antes pero llevan 21+ días
//     sin un nuevo pedido (churn de facturas en Reparto).
// Se agrupan en el mismo cron porque Vercel Hobby sólo permite 2 cron jobs.
// Corre con service-role (sin sesión).
//
// Seguridad: si CRON_SECRET está configurado en Vercel, exige el header
// Authorization: Bearer <CRON_SECRET> (Vercel lo inyecta automáticamente).

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { buildInactiveAccountsDigest, DEFAULT_INACTIVE_DAYS } from "@/lib/inactive-accounts-email";
import { buildSinPedidosDigest, DEFAULT_SIN_PEDIDOS_DAYS } from "@/lib/sin-pedidos-email";
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

  const from = ventasFrom();
  let inactivos = 0;
  let sinPedidos = 0;
  let saltados = 0;
  const errores: string[] = [];

  for (const r of (reps ?? []) as { id: string; email: string | null }[]) {
    // 1) Clientes sin actividad registrada.
    const inact = await buildInactiveAccountsDigest(supabase, r.id, DEFAULT_INACTIVE_DAYS);
    if (inact.ok) {
      try {
        await sendEmail({ to: inact.to, subject: inact.subject, html: inact.html, from });
        inactivos++;
      } catch (e) {
        errores.push(`inactivos ${r.id}: ${e instanceof Error ? e.message : String(e)}`);
      }
    } else {
      saltados++;
    }

    // 2) Clientes que dejaron de pedir (churn de facturas).
    const churn = await buildSinPedidosDigest(supabase, r.id, DEFAULT_SIN_PEDIDOS_DAYS);
    if (churn.ok) {
      try {
        await sendEmail({ to: churn.to, subject: churn.subject, html: churn.html, from });
        sinPedidos++;
      } catch (e) {
        errores.push(`sin-pedidos ${r.id}: ${e instanceof Error ? e.message : String(e)}`);
      }
    } else {
      saltados++;
    }
  }

  return NextResponse.json({ ok: true, inactivos, sinPedidos, saltados, errores });
}
