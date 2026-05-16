// GET /api/reparto/diag — diagnóstico admin: verifica que las env vars de Reparto
// estén configuradas y que la "service_role key" sea realmente service_role.
// No expone las llaves, solo metadatos.

import { NextResponse } from "next/server";
import { requireAdmin } from "../_lib/guard";

export const dynamic = "force-dynamic";

function decodeJwtPayload(jwt: string | undefined) {
  if (!jwt) return null;
  const parts = jwt.split(".");
  if (parts.length < 2) return null;
  try {
    const pad = parts[1].length % 4 === 0 ? "" : "=".repeat(4 - (parts[1].length % 4));
    const json = Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/") + pad, "base64").toString("utf8");
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export async function GET() {
  const { response } = await requireAdmin();
  if (response) return response;

  const url = process.env.NEXT_PUBLIC_REPARTO_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_REPARTO_SUPABASE_ANON_KEY;
  const sr = process.env.REPARTO_SUPABASE_SERVICE_ROLE_KEY;

  const anonClaims = decodeJwtPayload(anon);
  const srClaims = decodeJwtPayload(sr);

  return NextResponse.json({
    NEXT_PUBLIC_REPARTO_SUPABASE_URL: url ? "set" : "MISSING",
    NEXT_PUBLIC_REPARTO_SUPABASE_ANON_KEY: anon ? `set (role=${anonClaims?.role ?? "?"})` : "MISSING",
    REPARTO_SUPABASE_SERVICE_ROLE_KEY: sr ? `set (role=${srClaims?.role ?? "?"})` : "MISSING",
    expected: {
      anon_role: "anon",
      service_role: "service_role",
    },
    diagnostico: {
      anon_correcta: anonClaims?.role === "anon",
      service_role_correcta: srClaims?.role === "service_role",
      mismas_llaves: anon && sr && anon === sr,
    },
  });
}
