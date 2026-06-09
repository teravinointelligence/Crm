// GET  /api/vendedores/[repId]/clientes-inactivos?days=15 → borrador
// POST /api/vendedores/[repId]/clientes-inactivos  body {days?: number} → envía
//
// Auth: solo admin (herramienta de gestión interna).

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/auth";
import { buildInactiveAccountsDigest, DEFAULT_INACTIVE_DAYS } from "@/lib/inactive-accounts-email";
import { sendEmail, ventasFrom } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Normaliza el umbral de días a un entero razonable (1–365). */
const cleanDays = (raw: unknown): number => {
  const n = typeof raw === "string" ? Number(raw) : typeof raw === "number" ? raw : NaN;
  if (!Number.isFinite(n)) return DEFAULT_INACTIVE_DAYS;
  return Math.min(365, Math.max(1, Math.round(n)));
};

export async function GET(req: Request, { params }: { params: { repId: string } }) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Solo admin" }, { status: 403 });
  const days = cleanDays(new URL(req.url).searchParams.get("days"));
  const supabase = createClient();
  const draft = await buildInactiveAccountsDigest(supabase, params.repId, days);
  if (!draft.ok) return NextResponse.json({ error: draft.error }, { status: draft.status });
  return NextResponse.json(draft);
}

export async function POST(req: Request, { params }: { params: { repId: string } }) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Solo admin" }, { status: 403 });
  const body = (await req.json().catch(() => null)) as { days?: number } | null;
  const days = cleanDays(body?.days);

  const supabase = createClient();
  const draft = await buildInactiveAccountsDigest(supabase, params.repId, days);
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
