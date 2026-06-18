// POST /api/flota/fallas — un chofer (o logística) reporta una falla de un
// vehículo. Inserta en fleet_fault_reports (RLS: reported_by = el usuario) y
// notifica por correo a Logística (jefe_logistica) con copia al admin.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRep } from "@/lib/auth";
import { canReportFleetFault } from "@/lib/modules";
import { sendEmail, crmFrom } from "@/lib/email";
import { FAULT_TYPES, FAULT_URGENCY, URGENCY_LABEL, type FaultUrgency } from "@/lib/flota-faults";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "https://crm-steel-tau.vercel.app").replace(/\/+$/, "");
const ADMIN_CC = process.env.FLOTA_FALLAS_CC || "sabrina@teravino.com";

export async function POST(req: Request) {
  const rep = await getCurrentRep();
  if (!rep) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!canReportFleetFault(rep.role)) {
    return NextResponse.json({ error: "Sin acceso" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const vehicleId = typeof body?.vehicleId === "string" && body.vehicleId ? body.vehicleId : null;
  const vehicleLabel = typeof body?.vehicleLabel === "string" ? body.vehicleLabel.trim() : "";
  const faultType = typeof body?.faultType === "string" ? body.faultType : "";
  const urgency: FaultUrgency = FAULT_URGENCY.includes(body?.urgency) ? body.urgency : "media";
  const description = typeof body?.description === "string" ? body.description.trim() : "";
  const km = body?.km != null && body.km !== "" ? Number(body.km) : null;

  if (!vehicleLabel) return NextResponse.json({ error: "Indica el vehículo." }, { status: 400 });
  if (!description) return NextResponse.json({ error: "Describe la falla." }, { status: 400 });
  const tipo = FAULT_TYPES.includes(faultType as (typeof FAULT_TYPES)[number]) ? faultType : "Otro";

  const supabase = createClient();
  const { data: inserted, error } = await supabase
    .from("fleet_fault_reports")
    .insert({
      vehicle_id: vehicleId,
      vehicle_label: vehicleLabel,
      fault_type: tipo,
      description,
      urgency,
      km: km != null && Number.isFinite(km) ? km : null,
      reported_by: rep.id,
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Notificación a Logística (jefe_logistica) + copia al admin. Best-effort.
  let notified = false;
  try {
    const { data: managers } = await supabase
      .from("sales_reps")
      .select("email")
      .eq("role", "jefe_logistica")
      .eq("active", true)
      .not("email", "is", null);

    const to = Array.from(
      new Set((managers ?? []).map((m: { email: string | null }) => m.email?.trim()).filter(Boolean) as string[]),
    );
    const ccList = to.some((e) => e.toLowerCase() === ADMIN_CC.toLowerCase()) ? [] : [ADMIN_CC];
    // Si no hay correo de logística, manda directo al admin.
    const finalTo = to.length ? to : [ADMIN_CC];
    const finalCc = to.length ? ccList : [];

    const { subject, html } = renderFaultEmail({
      vehicleLabel,
      tipo,
      urgency,
      km,
      description,
      reporter: rep.full_name,
    });
    await sendEmail({ to: finalTo, cc: finalCc.length ? finalCc : undefined, subject, html, from: crmFrom() });
    notified = true;
  } catch {
    // no romper el reporte si el correo falla
  }

  return NextResponse.json({ ok: true, id: inserted?.id, notified });
}

function renderFaultEmail(f: {
  vehicleLabel: string;
  tipo: string;
  urgency: FaultUrgency;
  km: number | null;
  description: string;
  reporter: string;
}): { subject: string; html: string } {
  const urgente = f.urgency === "alta";
  const subject = `${urgente ? "[URGENTE] " : ""}Falla reportada — ${f.vehicleLabel}`;
  const urgencyColor = f.urgency === "alta" ? "#A91E3A" : f.urgency === "media" ? "#b7791f" : "#7A6E70";
  const html = `
    <div style="font-family:Helvetica,Arial,sans-serif;max-width:600px;margin:0 auto;color:#1F1A1C">
      <div style="border-bottom:2px solid #A91E3A;padding-bottom:10px;margin-bottom:16px">
        <span style="font-size:22px;letter-spacing:4px;color:#A91E3A">TERAVINO</span>
        <div style="font-size:9px;letter-spacing:3px;color:#c9a96e">FLOTA</div>
      </div>
      <h2 style="color:#A91E3A;font-size:18px;margin:0 0 4px">Falla de vehículo reportada</h2>
      <p style="margin:0 0 12px"><strong>${f.vehicleLabel}</strong></p>
      <table style="border-collapse:collapse;font-size:14px;margin-bottom:12px">
        <tr><td style="padding:3px 12px 3px 0;color:#555">Tipo</td><td style="padding:3px 0"><strong>${f.tipo}</strong></td></tr>
        <tr><td style="padding:3px 12px 3px 0;color:#555">Urgencia</td><td style="padding:3px 0;color:${urgencyColor}"><strong>${URGENCY_LABEL[f.urgency]}</strong></td></tr>
        ${f.km != null ? `<tr><td style="padding:3px 12px 3px 0;color:#555">Kilometraje</td><td style="padding:3px 0">${f.km.toLocaleString("es-MX")} km</td></tr>` : ""}
        <tr><td style="padding:3px 12px 3px 0;color:#555">Reportó</td><td style="padding:3px 0">${f.reporter}</td></tr>
      </table>
      <div style="background:#FAF7F2;border:1px solid #c9a96e;border-radius:8px;padding:12px;font-size:14px;line-height:1.5;white-space:pre-line">${f.description}</div>
      <p style="margin-top:16px">
        <a href="${APP_URL}/flota/fallas" style="background:#A91E3A;color:#fff;text-decoration:none;padding:9px 16px;border-radius:6px;font-size:14px">Ver en el CRM</a>
      </p>
    </div>`;
  return { subject, html };
}
