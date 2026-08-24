import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRep } from "@/lib/auth";
import { RestockRequestPdf, type RestockRequestPdfData } from "@/components/restock/RestockRequestPdf";
import { FULFILLMENT_LABEL, type FulfillmentType } from "@/lib/restock-fulfillment";
import { formatDateTime } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  if (!(await getCurrentRep())) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const supabase = createClient();
  const { data: request } = await supabase
    .from("restock_requests")
    .select("request_number, region_destino, fulfillment, status, created_at, notes, sales_reps:sales_rep_id(full_name), restock_request_items(product_name, supplier, quantity_requested, quantity_approved, notes)")
    .eq("id", params.id)
    .maybeSingle();
  if (!request) return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 });

  const seller = (Array.isArray(request.sales_reps) ? request.sales_reps[0] : request.sales_reps) as { full_name: string | null } | null;
  const data: RestockRequestPdfData = {
    requestNumber: request.request_number,
    vendedor: seller?.full_name ?? "Sin vendedor",
    region: request.region_destino ?? "Sin region",
    fulfillment: request.fulfillment ? FULFILLMENT_LABEL[request.fulfillment as FulfillmentType] ?? request.fulfillment : "Sin definir",
    status: request.status ?? "Sin estatus",
    createdAt: formatDateTime(request.created_at),
    notes: request.notes,
    items: (request.restock_request_items ?? []).map((item) => ({
      productName: item.product_name,
      supplier: item.supplier ?? "Sin proveedor",
      requested: Number(item.quantity_requested ?? 0),
      approved: item.quantity_approved == null ? null : Number(item.quantity_approved),
      notes: item.notes,
    })),
  };
  const pdf = await renderToBuffer(RestockRequestPdf({ data }));
  return new NextResponse(new Uint8Array(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${request.request_number}.pdf"` },
  });
}
