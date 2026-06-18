// POST /api/catalogo/transferencias/[id]/decision — admin aprueba / rechaza /
// completa una solicitud de transferencia (UPDATE con RLS admin) y notifica por
// correo al vendedor que la solicitó.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRep } from "@/lib/auth";
import { sendEmail, crmFrom } from "@/lib/email";
import { TRANSFER_STATUS, TRANSFER_STATUS_LABEL, type TransferStatus } from "@/lib/warehouse-transfers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const rep = await getCurrentRep();
  if (!rep) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (rep.role !== "admin") return NextResponse.json({ error: "Solo admin" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const status = body?.status as TransferStatus;
  if (!TRANSFER_STATUS.includes(status) || status === "pendiente") {
    return NextResponse.json({ error: "Estatus inválido." }, { status: 400 });
  }
  const notes = typeof body?.notes === "string" ? body.notes.trim() : "";

  const supabase = createClient();
  const { data: updated, error } = await supabase
    .from("warehouse_transfer_requests")
    .update({
      status,
      decided_by: rep.id,
      decided_at: new Date().toISOString(),
      admin_notes: notes || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.id)
    .select("product_label, from_warehouse, to_warehouse, quantity, requested_by")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Notificar al solicitante. Best-effort.
  let notified = false;
  try {
    const { data: requester } = await supabase
      .from("sales_reps")
      .select("email, full_name")
      .eq("id", updated.requested_by)
      .maybeSingle();
    const email = (requester as { email?: string } | null)?.email?.trim();
    if (email) {
      const label = TRANSFER_STATUS_LABEL[status].toLowerCase();
      const color = status === "rechazada" ? "#A91E3A" : "#2f855a";
      const html = `
        <div style="font-family:Helvetica,Arial,sans-serif;max-width:600px;margin:0 auto;color:#1F1A1C">
          <div style="border-bottom:2px solid #A91E3A;padding-bottom:10px;margin-bottom:16px">
            <span style="font-size:22px;letter-spacing:4px;color:#A91E3A">TERAVINO</span>
          </div>
          <h2 style="color:#A91E3A;font-size:18px;margin:0 0 4px">Tu solicitud de transferencia fue <span style="color:${color}">${label}</span></h2>
          <p style="margin:0 0 12px"><strong>${updated.product_label}</strong></p>
          <p style="font-size:14px;margin:2px 0">Ruta: <strong>${updated.from_warehouse} → ${updated.to_warehouse}</strong></p>
          <p style="font-size:14px;margin:2px 0">Cantidad: <strong>${updated.quantity}</strong></p>
          ${notes ? `<p style="font-size:14px;margin:8px 0;color:#555">Nota: ${notes}</p>` : ""}
        </div>`;
      await sendEmail({
        to: email,
        subject: `Transferencia ${label} — ${updated.product_label}`,
        html,
        from: crmFrom(),
        replyTo: rep.email || undefined,
      });
      notified = true;
    }
  } catch {
    // no romper la decisión si el correo falla
  }

  return NextResponse.json({ ok: true, notified });
}
