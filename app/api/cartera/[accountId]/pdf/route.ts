import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import { StatementPdf } from "@/components/cartera/StatementPdf";
import { buildStatementData } from "@/lib/statement";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: { accountId: string } },
) {
  const supabase = createClient();

  const data = await buildStatementData(supabase, params.accountId);
  if (!data) {
    return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 });
  }

  const pdf = await renderToBuffer(StatementPdf({ data }));
  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="estado-cuenta-${params.accountId}.pdf"`,
    },
  });
}
