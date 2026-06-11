// GET  /api/cuentas/[id]/datos-faltantes?criteria=sin_email,... → borrador
// POST /api/cuentas/[id]/datos-faltantes  body {criteria?: string[]} → envía
//
// Avisa al vendedor asignado de UNA cuenta sobre sus datos faltantes.
// Auth: solo admin (herramienta de gestión interna).

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/auth";
import { buildSingleAccountDigest } from "@/lib/missing-data-email";
import { MISSING_LABEL, type MissingFlag } from "@/lib/missing-data";
import { sendEmail, ventasFrom } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID = new Set(Object.keys(MISSING_LABEL));
const clean = (arr: unknown): MissingFlag[] | undefined => {
  if (!Array.isArray(arr)) return undefined;
  const out = arr.filter((x): x is MissingFlag => typeof x === "string" && VALID.has(x));
  return out.length ? out : undefined;
};

export async function GET(req: Request, { params }: { params: { id: string } }) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Solo admin" }, { status: 403 });
  const criteria = clean(new URL(req.url).searchParams.get("criteria")?.split(","));
  const supabase = createClient();
  const draft = await buildSingleAccountDigest(supabase, params.id, criteria);
  if (!draft.ok) return NextResponse.json({ error: draft.error }, { status: draft.status });
  return NextResponse.json(draft);
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Solo admin" }, { status: 403 });
  const body = (await req.json().catch(() => null)) as { criteria?: string[] } | null;
  const criteria = clean(body?.criteria);

  const supabase = createClient();
  const draft = await buildSingleAccountDigest(supabase, params.id, criteria);
  if (!draft.ok) return NextResponse.json({ error: draft.error }, { status: draft.status });

  try {
    await sendEmail({ to: draft.to, subject: draft.subject, html: draft.html, from: ventasFrom() });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "No se pudo enviar" },
      { status: 500 },
    );
  }
  return NextResponse.json({
    ok: true,
    to: draft.to,
    count: draft.count,
    repName: draft.repName,
    accountName: draft.accountName,
  });
}
