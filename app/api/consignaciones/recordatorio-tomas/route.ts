// POST /api/consignaciones/recordatorio-tomas  body { vendedorId, days? }
// Envía a UN vendedor el recordatorio de sus tomas de inventario pendientes.
// Auth: solo admin (herramienta de gestión interna).

import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { buildTomasInventarioDigest, DEFAULT_TOMA_DAYS } from "@/lib/tomas-inventario-email";
import { sendEmail, ventasFrom } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const cleanDays = (raw: unknown): number => {
  const n = typeof raw === "string" ? Number(raw) : typeof raw === "number" ? raw : NaN;
  if (!Number.isFinite(n)) return DEFAULT_TOMA_DAYS;
  return Math.min(365, Math.max(1, Math.round(n)));
};

export async function POST(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Solo admin" }, { status: 403 });

  const body = (await req.json().catch(() => null)) as { vendedorId?: string; days?: number } | null;
  const vendedorId = typeof body?.vendedorId === "string" ? body.vendedorId : null;
  if (!vendedorId) return NextResponse.json({ error: "Falta el vendedor." }, { status: 400 });
  const days = cleanDays(body?.days);

  const draft = await buildTomasInventarioDigest(vendedorId, days);
  if (!draft.ok) return NextResponse.json({ error: draft.error }, { status: draft.status });

  try {
    await sendEmail({ to: draft.to, subject: draft.subject, html: draft.html, from: ventasFrom() });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "No se pudo enviar" },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true, to: draft.to, count: draft.count, repName: draft.repName });
}
