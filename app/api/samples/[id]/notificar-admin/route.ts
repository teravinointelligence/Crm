// POST /api/samples/[id]/notificar-admin
//
// Envía un correo de aviso al inbox de muestras (MUESTRAS_ADMIN_EMAIL o
// pedidos@teravino.com) cuando el vendedor hace "Enviar solicitud".
// El admin/pedidos recibe el resumen de la solicitud para autorizarla o surtirla.
// Auth: el vendedor dueño de la solicitud o admin.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRep } from "@/lib/auth";
import { sendEmail, ventasFrom } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function muestrasAdminEmail(): string {
  return process.env.MUESTRAS_ADMIN_EMAIL || process.env.PEDIDOS_EMAIL || "pedidos@teravino.com";
}

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const rep = await getCurrentRep();
  if (!rep) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const supabase = createClient();
  const { data: req } = await supabase
    .from("sample_requests")
    .select(
      `request_number, reason, notes, training_people, ship_to_client, ship_date,
       sales_reps:sales_rep_id(full_name, email),
       accounts:account_id(business_name),
       sample_request_items(product_name, supplier, quantity, notes)`,
    )
    .eq("id", params.id)
    .maybeSingle();

  if (!req) return NextResponse.json({ error: "Solicitud no encontrada" }, { status: 404 });

  const account = (Array.isArray(req.accounts) ? req.accounts[0] : req.accounts) as
    | { business_name: string | null } | null;
  const salesRep = (Array.isArray(req.sales_reps) ? req.sales_reps[0] : req.sales_reps) as
    | { full_name: string | null; email: string | null } | null;
  const items = (req.sample_request_items ?? []) as Array<{
    product_name: string; supplier: string | null; quantity: number; notes: string | null;
  }>;
  const totalBottles = items.reduce((s, i) => s + Number(i.quantity ?? 0), 0);

  const rows = items
    .map(
      (i) =>
        `<tr>
          <td style="padding:6px 10px;border-bottom:1px solid #eee;">${i.product_name}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #eee;color:#555;">${i.supplier ?? "—"}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right;">${i.quantity}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #eee;color:#555;">${i.notes ?? "—"}</td>
        </tr>`,
    )
    .join("");

  const cliente = account?.business_name ?? null;
  const vendedor = salesRep?.full_name ?? "Vendedor";
  const esCapacitacion = req.training_people && Number(req.training_people) > 0;
  const esEnvioCliente = req.ship_to_client;

  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:0 auto;color:#222;">
    <h2 style="color:#7a1220;margin:0 0 4px;">TERAVINO — Nueva solicitud de muestras</h2>
    <p style="margin:0 0 16px;color:#666;">${req.request_number}${cliente ? ` · ${cliente}` : ""}</p>
    <p>Hola, <strong>${vendedor}</strong> acaba de enviar una solicitud de muestras${cliente ? ` para <strong>${cliente}</strong>` : ""}.</p>
    ${esCapacitacion ? `<p style="background:#fff8e1;padding:8px 12px;border-left:3px solid #f59e0b;margin:8px 0;font-size:14px;">📚 Capacitación · ${req.training_people} personas</p>` : ""}
    ${esEnvioCliente ? `<p style="background:#e8f5e9;padding:8px 12px;border-left:3px solid #4caf50;margin:8px 0;font-size:14px;">📦 Enviar al cliente${req.ship_date ? ` · ${new Intl.DateTimeFormat("es-MX", { dateStyle: "medium" }).format(new Date(String(req.ship_date)))}` : ""}</p>` : ""}
    ${req.reason ? `<p style="font-size:14px;color:#555;margin:8px 0;"><strong>Motivo:</strong> ${req.reason}</p>` : ""}
    <table style="border-collapse:collapse;width:100%;font-size:14px;margin:16px 0;">
      <thead>
        <tr style="background:#f6f1ee;text-align:left;">
          <th style="padding:6px 10px;">Vino</th>
          <th style="padding:6px 10px;">Bodega</th>
          <th style="padding:6px 10px;text-align:right;">Botellas</th>
          <th style="padding:6px 10px;">Nota</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <p style="font-size:14px;margin:8px 0;"><strong>Total:</strong> ${totalBottles} botella(s)</p>
    ${req.notes ? `<p style="font-size:14px;color:#555;margin:4px 0;"><strong>Notas:</strong> ${req.notes}</p>` : ""}
    <p style="color:#666;font-size:13px;margin-top:24px;">Enviado desde el CRM por ${vendedor}${salesRep?.email ? ` (${salesRep.email})` : ""}.</p>
  </div>`;

  try {
    await sendEmail({
      to: muestrasAdminEmail(),
      from: ventasFrom(),
      replyTo: salesRep?.email ?? undefined,
      subject: `Nueva muestra ${req.request_number}${cliente ? ` · ${cliente}` : ""} — ${vendedor}`,
      html,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error al enviar notificación" },
      { status: 502 },
    );
  }
}
