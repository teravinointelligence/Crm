// GET /api/estado/[token]/pdf — Estado de cuenta en PDF, acceso PÚBLICO por
// token (sin login). El token se valida contra statement_tokens (expiración /
// revocación). Ruta exenta del auth de Supabase en el middleware; se sirve con
// service-role tras validar el token.

import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { StatementPdf } from "@/components/cartera/StatementPdf";
import { buildStatementData } from "@/lib/statement";
import { resolveStatementToken } from "@/lib/statement-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: { token: string } },
) {
  const admin = supabaseAdmin();
  const resolved = await resolveStatementToken(admin, params.token);
  if (!resolved) {
    return NextResponse.json({ error: "Link inválido o expirado" }, { status: 404 });
  }

  const data = await buildStatementData(admin, resolved.accountId);
  if (!data) {
    return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 });
  }

  const pdf = await renderToBuffer(StatementPdf({ data }));
  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="estado-de-cuenta.pdf"`,
      // No cachear: el saldo cambia y el token puede revocarse.
      "Cache-Control": "no-store, private",
    },
  });
}
