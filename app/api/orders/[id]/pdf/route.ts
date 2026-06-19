import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import { OrderPdf, type OrderPdfData } from "@/components/orders/OrderPdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const supabase = createClient();

  const { data: order, error } = await supabase
    .from("orders")
    .select(
      `
      id, order_number, order_type, order_date, notes,
      subtotal, iva, total, discount_pct, discount_amount,
      accounts:account_id (
        business_name, fiscal_name, rfc, address, city, region
      ),
      sales_reps:sales_rep_id ( full_name, email ),
      order_items ( product_name, supplier, vintage, quantity, unit_price, line_total )
      `,
    )
    .eq("id", params.id)
    .single();

  if (error || !order) {
    return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 });
  }

  const data: OrderPdfData = {
    order: {
      order_number: order.order_number,
      order_type: order.order_type,
      order_date: order.order_date,
      notes: order.notes,
      subtotal: Number(order.subtotal ?? 0),
      iva: Number(order.iva ?? 0),
      total: Number(order.total ?? 0),
      discount_pct: Number(order.discount_pct ?? 0),
      discount_amount: Number(order.discount_amount ?? 0),
    },
    account: order.accounts as unknown as OrderPdfData["account"],
    rep: order.sales_reps as unknown as OrderPdfData["rep"],
    items: ((order.order_items ?? []) as unknown as OrderPdfData["items"]).map((i) => ({
      ...i,
      quantity: Number(i.quantity),
      unit_price: Number(i.unit_price),
      line_total: Number(i.line_total),
    })),
  };

  const pdf = await renderToBuffer(OrderPdf({ data }));

  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${order.order_number}.pdf"`,
    },
  });
}
