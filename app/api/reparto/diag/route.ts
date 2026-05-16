// GET /api/reparto/diag — diagnóstico admin: confirma que las env vars de Reparto
// estén configuradas y que la "service_role key" sea realmente service_role.
// No expone las llaves completas, solo metadatos.

import { NextResponse } from "next/server";
import { requireAdmin } from "../_lib/guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function decodeJwtPayload(jwt: string | undefined) {
  if (!jwt) return null;
  const parts = jwt.split(".");
  if (parts.length < 2) return null;
  try {
    const b64url = parts[1];
    const pad = b64url.length % 4 === 0 ? "" : "=".repeat(4 - (b64url.length % 4));
    const json = Buffer.from(b64url.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64").toString("utf8");
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function inspect(name: string, val: string | undefined) {
  if (!val) return { name, present: false };
  const trimmed = val.trim();
  const hasWrappingQuotes = (trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"));
  const cleaned = hasWrappingQuotes ? trimmed.slice(1, -1) : trimmed;
  const parts = cleaned.split(".");
  const claims = decodeJwtPayload(cleaned);
  return {
    name,
    present: true,
    length: val.length,
    starts_with: val.slice(0, 8),
    ends_with: val.slice(-6),
    starts_with_eyJ: val.startsWith("eyJ"),
    looks_like_jwt: parts.length === 3 && cleaned.startsWith("eyJ"),
    has_surrounding_quotes_or_whitespace: hasWrappingQuotes || val !== trimmed,
    jwt_parts: parts.length,
    jwt_role: claims?.role ?? null,
    jwt_ref: claims?.ref ?? null,
  };
}

export async function GET() {
  const { response } = await requireAdmin();
  if (response) return response;

  const url = process.env.NEXT_PUBLIC_REPARTO_SUPABASE_URL;
  const anon = inspect("NEXT_PUBLIC_REPARTO_SUPABASE_ANON_KEY", process.env.NEXT_PUBLIC_REPARTO_SUPABASE_ANON_KEY);
  const sr = inspect("REPARTO_SUPABASE_SERVICE_ROLE_KEY", process.env.REPARTO_SUPABASE_SERVICE_ROLE_KEY);

  return NextResponse.json({
    url: { present: !!url, value_preview: url ? url.replace(/\/+$/, "") : null },
    anon,
    service_role: sr,
    diagnostico: {
      anon_correcta: anon.jwt_role === "anon",
      service_role_correcta: sr.jwt_role === "service_role",
      service_role_es_anon: sr.jwt_role === "anon",
      mismas_llaves: anon.present && sr.present && process.env.NEXT_PUBLIC_REPARTO_SUPABASE_ANON_KEY === process.env.REPARTO_SUPABASE_SERVICE_ROLE_KEY,
      hint:
        !sr.present ? "Falta REPARTO_SUPABASE_SERVICE_ROLE_KEY en Vercel."
        : !sr.looks_like_jwt ? "El valor de REPARTO_SUPABASE_SERVICE_ROLE_KEY NO parece un JWT (espera 3 partes separadas por '.', empieza con 'eyJ'). Posiblemente está truncado o tiene comillas."
        : sr.has_surrounding_quotes_or_whitespace ? "El valor tiene comillas o espacios alrededor — quítalos en Vercel y vuelve a guardar."
        : sr.jwt_role === "anon" ? "Es la llave ANON. Necesitas la SERVICE_ROLE (en Supabase Settings → API → service_role secret)."
        : sr.jwt_role === "service_role" ? "Todo correcto."
        : "JWT con role inesperado.",
    },
  });
}
