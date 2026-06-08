// GET /api/reparto/diag — diagnóstico admin del módulo Reparto.
// Tras la consolidación, Reparto vive en la BD del CRM (esquema `reparto`) usando
// el service_role del CRM. Este endpoint confirma que la llave sea realmente
// service_role y que el esquema `reparto` sea alcanzable (un probe en vivo).
// No expone las llaves completas, solo metadatos.

import { NextResponse } from "next/server";
import { requireAdmin } from "../_lib/guard";
import { repartoAdmin } from "@/lib/supabase-reparto";

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
  const cleaned =
    (trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))
      ? trimmed.slice(1, -1)
      : trimmed;
  const claims = decodeJwtPayload(cleaned);
  return {
    name,
    present: true,
    looks_like_jwt: cleaned.split(".").length === 3 && cleaned.startsWith("eyJ"),
    jwt_role: claims?.role ?? null,
    jwt_ref: claims?.ref ?? null,
  };
}

export async function GET() {
  const { response } = await requireAdmin();
  if (response) return response;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const sr = inspect("SUPABASE_SERVICE_ROLE_KEY", process.env.SUPABASE_SERVICE_ROLE_KEY);

  // Probe en vivo: confirma que el esquema `reparto` esté expuesto y sea legible.
  let schema_reachable = false;
  let pedidos_count: number | null = null;
  let probe_error: string | null = null;
  try {
    const { count, error } = await repartoAdmin
      .from("pedidos")
      .select("id", { count: "exact", head: true });
    if (error) probe_error = error.message;
    else {
      schema_reachable = true;
      pedidos_count = count ?? 0;
    }
  } catch (e) {
    probe_error = e instanceof Error ? e.message : String(e);
  }

  return NextResponse.json({
    modo: "consolidado (esquema reparto en la BD del CRM)",
    url: { present: !!url, value_preview: url ? url.replace(/\/+$/, "") : null },
    service_role: sr,
    schema_reparto: {
      reachable: schema_reachable,
      pedidos_count,
      error: probe_error,
    },
    diagnostico: {
      service_role_correcta: sr.jwt_role === "service_role",
      hint: !sr.present
        ? "Falta SUPABASE_SERVICE_ROLE_KEY en el entorno (Vercel → Settings → Environment Variables)."
        : sr.jwt_role !== "service_role"
          ? "La llave no es service_role. Usa la 'service_role secret' del proyecto teravino-crm (Supabase → Settings → API)."
          : !schema_reachable
            ? "No se pudo leer el esquema 'reparto'. Verifica que esté agregado en Project Settings → API → Exposed schemas del proyecto teravino-crm."
            : "Todo correcto.",
    },
  });
}
