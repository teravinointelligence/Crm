import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import { SampleRequestPdf, type SampleRequestPdfData } from "@/components/samples/SampleRequestPdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const supabase = createClient();
  const { data: req, error } = await supabase
    .from("sample_requests")
    .select(
      "request_number, status, created_at, reason, notes, review_notes, sales_reps:sales_rep_id(full_name), reviewer:reviewed_by(full_name), accounts:account_id(business_name, region), sample_request_items(product_name, supplier, quantity, notes)",
    )
    .eq("id", params.id)
    .single();
  if (error || !req) {
    return NextResponse.json({ error: "Solicitud no encontrada" }, { status: 404 });
  }

  const data: SampleRequestPdfData = {
    request_number: String(req.request_number),
    status: String(req.status ?? ""),
    created_at: (req.created_at as string | null) ?? null,
    reason: (req.reason as string | null) ?? null,
    notes: (req.notes as string | null) ?? null,
    review_notes: (req.review_notes as string | null) ?? null,
    rep: req.sales_reps as unknown as SampleRequestPdfData["rep"],
    reviewer: req.reviewer as unknown as SampleRequestPdfData["reviewer"],
    account: req.accounts as unknown as SampleRequestPdfData["account"],
    items: ((req.sample_request_items ?? []) as never[]).map((i: Record<string, unknown>) => ({
      product_name: String(i.product_name),
      supplier: i.supplier ? String(i.supplier) : null,
      quantity: Number(i.quantity ?? 0),
      notes: i.notes ? String(i.notes) : null,
    })),
  };

  const pdf = await renderToBuffer(SampleRequestPdf({ data }));
  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${data.request_number}.pdf"`,
    },
  });
}
