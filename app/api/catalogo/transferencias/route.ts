// POST /api/catalogo/transferencias — un vendedor (o admin) crea una solicitud
// de transferencia entre almacenes. Inserta (RLS: requested_by = el usuario) y
// avisa por correo a los admin (quienes aprueban).

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRep } from "@/lib/auth";
import { sendEmail, crmFrom } from "@/lib/email";
import { WAREHOUSES } from "@/lib/warehouses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "https://crm-steel-tau.vercel.app").replace(/\/+$/, "");

function canRequest(role: string | null | undefined) {
  return role === "admin" || role === "rep";
}

export async function POST(req: Request) {
  const rep = await getCurrentRep();
  if (!rep) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!canRequest(rep.role)) return NextResponse.json({ error: "Sin acceso" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const productId = typeof body?.productId === "string" && body.productId ? body.productId : null;
  const productLabel = typeof body?.productLabel === "string" ? body.productLabel.trim() : "";
  const from = typeof body?.fromWarehouse === "string" ? body.fromWarehouse : "";
  const to = typeof body?.toWarehouse === "string" ? body.toWarehouse : "";
  const quantity = Number(body?.quantity);
  const reason = typeof body?.reason === "string" ? body.reason.trim() : "";

  if (!productLabel) return NextResponse.json({ error: "Falta el producto." }, { status: 400 });
  if (!WAREHOUSES.includes(from as (typeof WAREHOUSES)[number]) || !WAREHOUSES.includes(to as (typeof WAREHOUSES)[number])) {
    return NextResponse.json({ error: "Almacén inválido." }, { status: 400 });
  }
  if (from === to) return NextResponse.json({ error: "Origen y destino deben ser distintos." }, { status: 400 });
  if (!quantity || quantity <= 0) return NextResponse.json({ error: "Cantidad inválida." }, { status: 400 });

  const supabase = createClient();
  const { data: inserted, error } = await supabase
    .from("warehouse_transfer_requests")
    .insert({
      product_id: productId,
      product_label: productLabel,
      from_warehouse: from,
      to_warehouse: to,
      quantity,
      reason: reason || null,
      requested_by: rep.id,
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Aviso a los admin (quienes aprueban). Best-effort.
  let notified = false;
  try {
    const { data: admins } = await supabase
      .from("sales_reps")
      .select("email")
      .eq("role", "admin")
      .eq("active", true)
      .not("email", "is", null);
    const to_ = Array.from(
      new Set((admins ?? []).map((a: { email: string | null }) => a.email?.trim()).filter(Boolean) as string[]),
    );
    if (to_.length) {
      const html = `
        <div style="font-family:Helvetica,Arial,sans-serif;max-width:600px;margin:0 auto;color:#1F1A1C">
          <div style="border-bottom:2px solid #A91E3A;padding-bottom:10px;margin-bottom:16px">
            <span style="font-size:22px;letter-spacing:4px;color:#A91E3A">TERAVINO</span>
          </div>
          <h2 style="color:#A91E3A;font-size:18px;margin:0 0 4px">Nueva solicitud de transferencia</h2>
          <p style="margin:0 0 12px"><strong>${productLabel}</strong></p>
          <p style="font-size:14px;margin:2px 0">Ruta: <strong>${from} → ${to}</strong></p>
          <p style="font-size:14px;margin:2px 0">Cantidad: <strong>${quantity}</strong></p>
          <p style="font-size:14px;margin:2px 0">Solicita: ${rep.full_name}</p>
          ${reason ? `<p style="font-size:14px;margin:8px 0;color:#555">Motivo: ${reason}</p>` : ""}
          <p style="margin-top:16px"><a href="${APP_URL}/catalogo/transferencias" style="background:#A91E3A;color:#fff;text-decoration:none;padding:9px 16px;border-radius:6px;font-size:14px">Revisar y aprobar</a></p>
        </div>`;
      await sendEmail({
        to: to_,
        subject: `Solicitud de transferencia — ${productLabel} (${from} → ${to})`,
        html,
        from: crmFrom(),
        replyTo: rep.email || undefined,
      });
      notified = true;
    }
  } catch {
    // no romper la solicitud si el correo falla
  }

  return NextResponse.json({ ok: true, id: inserted?.id, notified });
}
