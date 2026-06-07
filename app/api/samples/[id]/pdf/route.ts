import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { renderSamplePdf } from "@/lib/sample-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const supabase = createClient();
  const pdf = await renderSamplePdf(supabase, params.id);
  if (!pdf) {
    return NextResponse.json({ error: "Solicitud no encontrada" }, { status: 404 });
  }
  return new NextResponse(new Uint8Array(pdf.buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${pdf.requestNumber}.pdf"`,
    },
  });
}
