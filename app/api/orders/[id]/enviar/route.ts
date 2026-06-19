// POST /api/orders/[id]/enviar
//
// Envía el pedido por correo al buzón interno de pedidos (pedidos@teravino.com)
// con el PDF adjunto, para que el equipo lo procese/facture. Marca el pedido
// como "enviada". Solo admin o el vendedor dueño del pedido.

import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { getCurrentRep } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { sendEmail, ventasFrom } from "@/lib/email";
import { OrderPdf, type OrderPdfData } from "@/components/orders/OrderPdf";
import { formatCurrency, formatDate } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function pedidosInbox(): string {
  return process.env.PEDIDOS_INBOX_EMAIL || "pedidos@teravino.com";
}

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const rep = await getCurrentRep();
  if (!rep) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const supabase = createClient();
  const { data: order } = await supabase
    .from("orders")
    .select(
      `id, order_number, order_type, order_date, notes, status, sales_rep_id,
       subtotal, iva, total, discount_pct, discount_amount,
       accounts:account_id ( business_name, fiscal_name, rfc, address, city, region, client_number ),
       sales_reps:sales_rep_id ( full_name, email ),
       order_items ( product_name, supplier, vintage, quantity, unit_price, line_total )`,
    )
    .eq("id", params.id)
    .single();

  if (!order) return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 });

  const account = order.accounts as unknown as {
    business_name: string | null; fiscal_name: string | null; rfc: string | null;
    address: string | null; city: string | null; region: string | null; client_number: string | null;
  } | null;

  const items = ((order.order_items ?? []) as Array<{
    product_name: string; supplier: string | null; vintage: string | null;
    quantity: number; unit_price: number; line_total: number;
  }>).map((i) => ({ ...i, quantity: Number(i.quantity), unit_price: Number(i.unit_price), line_total: Number(i.line_total) }));

  // PDF del pedido (mismo render que la descarga).
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
    items,
  };
  const pdf = await renderToBuffer(OrderPdf({ data }));
  const pdfBase64 = Buffer.from(pdf).toString("base64");

  const filas = items
    .map(
      (i) =>
        `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee">${i.product_name}</td>` +
        `<td style="padding:4px 8px;border-bottom:1px solid #eee;text-align:right">${i.quantity}</td>` +
        `<td style="padding:4px 8px;border-bottom:1px solid #eee;text-align:right">${formatCurrency(i.unit_price)}</td>` +
        `<td style="padding:4px 8px;border-bottom:1px solid #eee;text-align:right">${formatCurrency(i.line_total)}</td></tr>`,
    )
    .join("");

  const html = `
    <div style="font-family:Helvetica,Arial,sans-serif;max-width:640px;margin:0 auto;color:#1F1A1C">
      <div style="border-bottom:2px solid #A91E3A;padding-bottom:10px;margin-bottom:16px">
        <span style="font-size:22px;letter-spacing:4px;color:#A91E3A">TERAVINO</span>
      </div>
      <h2 style="color:#A91E3A;font-size:18px;margin:0 0 4px">${order.order_number}</h2>
      <p style="margin:0 0 12px;color:#555">
        Cliente: <strong>${account?.business_name ?? "—"}</strong>
        ${account?.client_number ? ` · # ${account.client_number}` : ""}
        ${account?.region ? ` · ${account.region}` : ""}<br/>
        Fecha: ${formatDate(order.order_date)} · Atiende: ${rep.full_name}
      </p>
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead>
          <tr style="background:#f3f0ea;text-transform:uppercase;font-size:11px;color:#777">
            <th style="padding:6px 8px;text-align:left">Producto</th>
            <th style="padding:6px 8px;text-align:right">Cant.</th>
            <th style="padding:6px 8px;text-align:right">Precio</th>
            <th style="padding:6px 8px;text-align:right">Total</th>
          </tr>
        </thead>
        <tbody>${filas}</tbody>
      </table>
      <p style="text-align:right;margin:12px 0 0;font-size:15px">
        Subtotal: ${formatCurrency(Number(order.subtotal ?? 0))}<br/>
        ${Number(order.discount_amount ?? 0) > 0 ? `<span style="color:#A91E3A">Descuento${order.discount_pct ? ` (${order.discount_pct}%)` : ""}: - ${formatCurrency(Number(order.discount_amount ?? 0))}</span><br/>` : ""}
        IVA 16%: ${formatCurrency(Number(order.iva ?? 0))}<br/>
        <strong style="color:#A91E3A;font-size:18px">Total: ${formatCurrency(Number(order.total ?? 0))}</strong>
      </p>
      ${order.notes ? `<p style="margin-top:12px;color:#555"><strong>Notas:</strong> ${order.notes}</p>` : ""}
      <p style="margin-top:16px;font-size:12px;color:#888;border-top:1px solid #c9a96e;padding-top:10px">
        Pedido enviado desde el CRM por ${rep.full_name}. PDF adjunto.
      </p>
    </div>`;

  try {
    const result = await sendEmail({
      to: pedidosInbox(),
      subject: `Pedido ${order.order_number} — ${account?.business_name ?? "Cliente"}`,
      html,
      from: ventasFrom(),
      replyTo: rep.email || undefined,
      attachments: [{ filename: `${order.order_number}.pdf`, content: pdfBase64 }],
    });

    // Marcar como enviada (si seguía en borrador/enviada no terminal).
    if (["borrador", "enviada"].includes(order.status ?? "")) {
      await supabase.from("orders").update({ status: "enviada" }).eq("id", order.id);
    }

    return NextResponse.json({ ok: true, id: result.id, to: pedidosInbox() });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error al enviar el pedido" },
      { status: 502 },
    );
  }
}
