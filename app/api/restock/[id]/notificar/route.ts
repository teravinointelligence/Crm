import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRep } from "@/lib/auth";
import { crmFrom, sendEmail } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALERT_SELLERS = new Set(["emmanuel@teravino.com", "felix@teravino.com", "citlali@teravino.com"]);
const escapeHtml = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char);

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const currentRep = await getCurrentRep();
  if (!currentRep) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const supabase = createClient();
  const { data: request } = await supabase
    .from("restock_requests")
    .select("id, request_number, sales_rep_id, region_destino, fulfillment, status, notes, sales_reps:sales_rep_id(full_name, email), restock_request_items(product_name, supplier, quantity_requested, notes)")
    .eq("id", params.id)
    .maybeSingle();
  if (!request) return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 });
  if (currentRep.role !== "admin" && request.sales_rep_id !== currentRep.id) return NextResponse.json({ error: "Sin permiso" }, { status: 403 });

  const seller = (Array.isArray(request.sales_reps) ? request.sales_reps[0] : request.sales_reps) as { full_name: string | null; email: string | null } | null;
  const sellerEmail = seller?.email?.trim().toLowerCase() ?? "";
  if (request.status !== "enviada" || !ALERT_SELLERS.has(sellerEmail)) return NextResponse.json({ ok: true, skipped: true });
  const items = request.restock_request_items ?? [];
  const rows = items.map((item) => `<tr><td style="padding:7px;border-bottom:1px solid #eee">${escapeHtml(item.product_name)}</td><td style="padding:7px;border-bottom:1px solid #eee">${escapeHtml(item.supplier || "-")}</td><td style="padding:7px;border-bottom:1px solid #eee;text-align:right">${Number(item.quantity_requested ?? 0)}</td></tr>`).join("");
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://crm.teravino.com";
  await sendEmail({
    to: process.env.RESTOCK_ALERT_EMAIL || "sabrina@teravino.com",
    from: crmFrom(),
    replyTo: sellerEmail || undefined,
    subject: `Nuevo restock ${request.request_number} - ${seller?.full_name ?? "Vendedor"}`,
    html: `<div style="font-family:Arial,sans-serif;max-width:640px;color:#241e20"><h2 style="color:#7a1220">Nuevo pedido de restock</h2><p><strong>${escapeHtml(seller?.full_name ?? "Vendedor")}</strong> envio el pedido <strong>${escapeHtml(request.request_number)}</strong>.</p><p>Destino: ${escapeHtml(request.region_destino || "Sin region")} - Surtido: ${escapeHtml(request.fulfillment || "Sin definir")}</p><table style="border-collapse:collapse;width:100%;font-size:14px"><thead><tr style="background:#f7f2ec;text-align:left"><th style="padding:7px">Producto</th><th style="padding:7px">Proveedor</th><th style="padding:7px;text-align:right">Cantidad</th></tr></thead><tbody>${rows}</tbody></table>${request.notes ? `<p><strong>Notas:</strong> ${escapeHtml(request.notes)}</p>` : ""}<p style="margin-top:20px"><a href="${appUrl}/restock/${request.id}" style="background:#7a1220;color:white;padding:10px 16px;text-decoration:none;border-radius:6px">Revisar en el CRM</a></p></div>`,
  });
  return NextResponse.json({ ok: true });
}
