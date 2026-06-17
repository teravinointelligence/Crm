// /api/cuentas/[id]/requisitos-consignacion
//
// GET  → vista previa: { cliente, to } (correos registrados de la cuenta).
// POST → envía el correo con los requisitos de consignación + PDF adjunto, a
//        los correos seleccionados. Body: { to: string[] }.
//
// Auth: admin/facturación o el vendedor asignado a la cuenta (RLS sobre accounts).

import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRep } from "@/lib/auth";
import { sendEmail, ventasFrom } from "@/lib/email";
import { RequisitosConsignatarioPdf } from "@/components/consignaciones/RequisitosConsignatarioPdf";
import {
  REQUISITOS_CONSIGNATARIO,
  REQUISITOS_TITULO,
  REQUISITOS_NOTA,
} from "@/lib/consignaciones-requisitos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function loadCuenta(accountId: string) {
  const supabase = createClient();
  const { data: account } = await supabase
    .from("accounts")
    .select("id, business_name")
    .eq("id", accountId)
    .maybeSingle();
  if (!account) return null;

  const { data: contacts } = await supabase
    .from("contacts")
    .select("email, is_primary")
    .eq("account_id", accountId)
    .not("email", "is", null)
    .order("is_primary", { ascending: false });

  const seen = new Set<string>();
  const to: string[] = [];
  for (const c of (contacts ?? []) as { email: string | null }[]) {
    const email = c.email?.trim();
    if (!email || !email.includes("@")) continue;
    const key = email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    to.push(email);
  }
  return { cliente: account.business_name as string, to };
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const rep = await getCurrentRep();
  if (!rep) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const ctx = await loadCuenta(params.id);
  if (!ctx) return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 });
  if (!ctx.to.length) {
    return NextResponse.json(
      { error: "El cliente no tiene un contacto con email. Agrégalo en la ficha de la cuenta." },
      { status: 400 },
    );
  }
  return NextResponse.json({ cliente: ctx.cliente, to: ctx.to });
}

function renderRequisitosEmail(cliente: string, vendedor: string): { subject: string; html: string } {
  const secciones = REQUISITOS_CONSIGNATARIO.map((sec) => {
    const items = sec.items.map((it) => `<li style="margin-bottom:6px">${it}</li>`).join("");
    return `
      <h3 style="color:#A91E3A;font-size:15px;margin:18px 0 4px">${sec.titulo}</h3>
      ${sec.intro ? `<p style="margin:0 0 8px;color:#444">${sec.intro}</p>` : ""}
      <ul style="margin:0 0 8px;padding-left:20px;color:#222">${items}</ul>`;
  }).join("");

  const html = `
    <div style="font-family:Helvetica,Arial,sans-serif;max-width:600px;margin:0 auto;color:#1F1A1C">
      <div style="border-bottom:2px solid #A91E3A;padding-bottom:10px;margin-bottom:16px">
        <span style="font-size:22px;letter-spacing:4px;color:#A91E3A">TERAVINO</span>
      </div>
      <h2 style="color:#A91E3A;font-size:18px">${REQUISITOS_TITULO}</h2>
      <p>Estimado cliente <strong>${cliente}</strong>,</p>
      <p>Para poder formalizar tu consignación con TERAVINO, te compartimos la lista de
      requisitos. Encontrarás el detalle también en el PDF adjunto.</p>
      ${secciones}
      <p style="margin-top:16px;color:#555;font-size:13px;border-top:1px solid #c9a96e;padding-top:12px">
        ${REQUISITOS_NOTA}
      </p>
      <p style="font-size:13px;color:#555">Saludos,<br/>${vendedor}<br/>TERAVINO</p>
    </div>`;

  return { subject: `Requisitos para consignación — TERAVINO`, html };
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const rep = await getCurrentRep();
  if (!rep) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const ctx = await loadCuenta(params.id);
  if (!ctx) return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 });
  if (!ctx.to.length) {
    return NextResponse.json({ error: "El cliente no tiene correos registrados." }, { status: 400 });
  }

  // Destinatarios: solo correos que de verdad pertenecen a la cuenta.
  const body = await req.json().catch(() => ({}));
  let to = ctx.to;
  if (Array.isArray(body?.to)) {
    const pedidos = new Set(
      body.to.filter((e: unknown): e is string => typeof e === "string").map((e: string) => e.toLowerCase()),
    );
    to = ctx.to.filter((e) => pedidos.has(e.toLowerCase()));
  }
  if (!to.length) {
    return NextResponse.json({ error: "Selecciona al menos un correo." }, { status: 400 });
  }

  const pdfBuffer = await renderToBuffer(RequisitosConsignatarioPdf({ clientName: ctx.cliente }));
  const pdfBase64 = Buffer.from(pdfBuffer).toString("base64");

  const { subject, html } = renderRequisitosEmail(ctx.cliente, rep.full_name);

  try {
    const result = await sendEmail({
      to,
      subject,
      html,
      from: ventasFrom(),
      replyTo: rep.email || undefined,
      attachments: [{ filename: "requisitos-consignacion.pdf", content: pdfBase64 }],
    });
    return NextResponse.json({ ok: true, id: result.id, to });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error al enviar el correo" },
      { status: 502 },
    );
  }
}
