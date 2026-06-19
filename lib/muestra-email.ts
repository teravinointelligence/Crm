// Armado del correo de una solicitud de muestras (HTML con formato TERAVINO).
// Es una solicitud de SURTIDO/ENVÍO dirigida al área de pedidos
// (pedidos@teravino.com): incluye cliente, fecha de envío y vinos a surtir.
// Compartido entre la vista previa (GET, borrador) y el envío real (POST) del
// endpoint /api/samples/[id]/enviar. NO envía nada por sí mismo.

import type { createClient } from "@/lib/supabase/server";

type DbClient = ReturnType<typeof createClient>;

/** Destinatario por defecto del correo de muestras: el área de pedidos. */
export function pedidosEmail(): string {
  return process.env.PEDIDOS_EMAIL || "pedidos@teravino.com";
}

const fmtDate = (d: string | null | undefined) =>
  d ? new Intl.DateTimeFormat("es-MX", { dateStyle: "medium" }).format(new Date(d)) : null;

export type MuestraEmailResult =
  | { ok: true; to: string; subject: string; html: string; requestNumber: string; repEmail: string | null }
  | { ok: false; status: number; error: string };

export async function buildMuestraEmail(
  supabase: DbClient,
  sampleId: string,
): Promise<MuestraEmailResult> {
  // La RLS limita sample_requests al admin o al rep dueño; si no la ve, 404.
  const { data: req } = await supabase
    .from("sample_requests")
    .select(
      "request_number, status, reason, notes, training_people, ship_to_client, ship_date, account_id, sales_reps:sales_rep_id(full_name, email), accounts:account_id(business_name), sample_request_items(product_name, supplier, quantity, notes)",
    )
    .eq("id", sampleId)
    .maybeSingle();
  if (!req) return { ok: false, status: 404, error: "Solicitud no encontrada" };

  const account = (Array.isArray(req.accounts) ? req.accounts[0] : req.accounts) as
    | { business_name: string | null }
    | null;
  const rep = (Array.isArray(req.sales_reps) ? req.sales_reps[0] : req.sales_reps) as
    | { full_name: string | null; email: string | null }
    | null;

  // El correo de muestras va al área de pedidos (surtido/envío). Editable en la UI.
  const to = pedidosEmail();
  const shipDate = req.ship_to_client ? fmtDate(req.ship_date as string | null) : null;

  const items = (req.sample_request_items ?? []) as Array<{
    product_name: string; supplier: string | null; quantity: number; notes: string | null;
  }>;
  const totalBottles = items.reduce((s, i) => s + Number(i.quantity ?? 0), 0);

  const rows = items
    .map(
      (i) => `
        <tr>
          <td style="padding:6px 10px;border-bottom:1px solid #eee;">${i.product_name}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #eee;color:#555;">${i.supplier ?? "—"}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right;">${i.quantity}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #eee;color:#555;">${i.notes ?? "—"}</td>
        </tr>`,
    )
    .join("");

  const cliente = account?.business_name ?? "";
  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:0 auto;color:#222;">
    <h2 style="color:#7a1220;margin:0 0 4px;">TERAVINO — Solicitud de muestras</h2>
    <p style="margin:0 0 16px;color:#666;">Solicitud ${req.request_number}${cliente ? ` · ${cliente}` : ""}</p>
    <p>Hola equipo de pedidos,</p>
    <p>Favor de preparar las siguientes muestras${cliente ? ` para <strong>${cliente}</strong>` : ""}${shipDate ? ` y enviarlas el <strong>${shipDate}</strong>` : ""}.</p>
    <table style="border-collapse:collapse;width:100%;font-size:14px;margin:12px 0;">
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
    <p style="font-size:14px;margin:8px 0;"><strong>Total de botellas:</strong> ${totalBottles}</p>
    ${cliente ? `<p style="font-size:14px;color:#555;margin:4px 0;"><strong>Cliente:</strong> ${cliente}</p>` : ""}
    ${shipDate ? `<p style="font-size:14px;color:#555;margin:4px 0;"><strong>Fecha de envío:</strong> ${shipDate}</p>` : ""}
    ${req.reason ? `<p style="font-size:14px;color:#555;margin:4px 0;"><strong>Motivo:</strong> ${req.reason}</p>` : ""}
    ${req.training_people ? `<p style="font-size:14px;color:#555;margin:4px 0;"><strong>Capacitación para:</strong> ${req.training_people} persona(s)</p>` : ""}
    ${req.notes ? `<p style="font-size:14px;color:#555;margin:4px 0;">${req.notes}</p>` : ""}
    <p style="margin-top:16px;font-size:14px;">Se adjunta el formato en PDF (${req.request_number}.pdf).</p>
    <p style="color:#666;font-size:13px;margin-top:24px;">Solicita: ${rep?.full_name ?? "Equipo TERAVINO"} · TERAVINO</p>
  </div>`;

  return {
    ok: true,
    to,
    subject: `Muestras ${req.request_number}${cliente ? ` · ${cliente}` : ""}${shipDate ? ` · enviar ${shipDate}` : ""} — TERAVINO`,
    html,
    requestNumber: String(req.request_number),
    repEmail: rep?.email ?? null,
  };
}

/**
 * Correo de CANCELACIÓN de una solicitud de muestras, dirigido al área de
 * pedidos (para que no surtan / regresen botellas a bodega). El vendedor
 * solicitante va en copia (lo arma el endpoint con `repEmail`).
 */
export async function buildMuestraCancelEmail(
  supabase: DbClient,
  sampleId: string,
): Promise<MuestraEmailResult> {
  const { data: req } = await supabase
    .from("sample_requests")
    .select(
      "request_number, account_id, sales_reps:sales_rep_id(full_name, email), accounts:account_id(business_name), sample_request_items(product_name, supplier, quantity, notes)",
    )
    .eq("id", sampleId)
    .maybeSingle();
  if (!req) return { ok: false, status: 404, error: "Solicitud no encontrada" };

  const account = (Array.isArray(req.accounts) ? req.accounts[0] : req.accounts) as
    | { business_name: string | null }
    | null;
  const rep = (Array.isArray(req.sales_reps) ? req.sales_reps[0] : req.sales_reps) as
    | { full_name: string | null; email: string | null }
    | null;

  const items = (req.sample_request_items ?? []) as Array<{
    product_name: string; supplier: string | null; quantity: number; notes: string | null;
  }>;
  const totalBottles = items.reduce((s, i) => s + Number(i.quantity ?? 0), 0);
  const rows = items
    .map(
      (i) => `
        <tr>
          <td style="padding:6px 10px;border-bottom:1px solid #eee;">${i.product_name}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #eee;color:#555;">${i.supplier ?? "—"}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right;">${i.quantity}</td>
        </tr>`,
    )
    .join("");

  const cliente = account?.business_name ?? "";
  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:0 auto;color:#222;">
    <h2 style="color:#7a1220;margin:0 0 4px;">TERAVINO — Muestras canceladas</h2>
    <p style="margin:0 0 16px;color:#666;">Solicitud ${req.request_number}${cliente ? ` · ${cliente}` : ""}</p>
    <p>Hola equipo de pedidos,</p>
    <p>La siguiente solicitud de muestras fue <strong>cancelada</strong>. Favor de <strong>no surtirla</strong>; si ya se había preparado, las botellas regresan a bodega.</p>
    <table style="border-collapse:collapse;width:100%;font-size:14px;margin:12px 0;">
      <thead>
        <tr style="background:#f6f1ee;text-align:left;">
          <th style="padding:6px 10px;">Vino</th>
          <th style="padding:6px 10px;">Bodega</th>
          <th style="padding:6px 10px;text-align:right;">Botellas</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <p style="font-size:14px;margin:8px 0;"><strong>Total de botellas:</strong> ${totalBottles}</p>
    ${cliente ? `<p style="font-size:14px;color:#555;margin:4px 0;"><strong>Cliente:</strong> ${cliente}</p>` : ""}
    <p style="color:#666;font-size:13px;margin-top:24px;">Solicitó: ${rep?.full_name ?? "Equipo TERAVINO"} · TERAVINO</p>
  </div>`;

  return {
    ok: true,
    to: pedidosEmail(),
    subject: `Muestras CANCELADAS ${req.request_number}${cliente ? ` · ${cliente}` : ""} — TERAVINO`,
    html,
    requestNumber: String(req.request_number),
    repEmail: rep?.email ?? null,
  };
}
