// /api/promociones/[id]/enviar
//
// GET  → lista de clientes a los que el usuario puede enviar (cuentas visibles
//        por RLS que tienen al menos un correo): { promo, clientes:[{id,name,email}] }.
// POST → envía el flyer (PDF) de la promoción por correo. Body:
//        { accountIds: string[], extraEmails?: string[] }.
//        Privacidad: los clientes van en BCC (no se ven entre ellos).
//
// Auth: cualquier usuario autenticado; los destinatarios se limitan a las
// cuentas que el usuario puede ver (RLS sobre accounts) + correos extra escritos.

import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRep } from "@/lib/auth";
import { sendEmail, ventasFrom } from "@/lib/email";
import { logClientEmail } from "@/lib/email-log";
import { PromoFlyerPdf, type PromoFlyerData } from "@/components/promociones/PromoFlyerPdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AccountRow = {
  id: string;
  business_name: string | null;
  billing_email: string | null;
  contacts: { email: string | null; is_primary: boolean | null }[] | null;
};

function bestEmail(a: AccountRow): string | null {
  const contacts = (a.contacts ?? []).filter((c) => c.email && c.email.includes("@"));
  const primary = contacts.find((c) => c.is_primary);
  const email = primary?.email ?? contacts[0]?.email ?? a.billing_email ?? null;
  return email && email.includes("@") ? email.trim() : null;
}

async function loadPromo(id: string): Promise<PromoFlyerData | null> {
  const supabase = createClient();
  const { data: p } = await supabase
    .from("promotions")
    .select("*, product:product_id(name)")
    .eq("id", id)
    .maybeSingle();
  if (!p) return null;
  return {
    title: p.title,
    product_name: (p as { product?: { name?: string } | null }).product?.name ?? null,
    promo_type: p.promo_type,
    description: p.description,
    discount_pct: p.discount_pct,
    bonus_qty: p.bonus_qty,
    bonus_per: p.bonus_per,
    valid_from: p.valid_from,
    valid_to: p.valid_to,
  };
}

async function loadClientes() {
  const supabase = createClient();
  const { data } = await supabase
    .from("accounts")
    .select("id, business_name, billing_email, contacts(email, is_primary)")
    .order("business_name");
  const clientes: { id: string; name: string; email: string }[] = [];
  for (const a of (data ?? []) as AccountRow[]) {
    const email = bestEmail(a);
    if (email) clientes.push({ id: a.id, name: a.business_name ?? "(sin nombre)", email });
  }
  return clientes;
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const rep = await getCurrentRep();
  if (!rep) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const promo = await loadPromo(params.id);
  if (!promo) return NextResponse.json({ error: "Promoción no encontrada" }, { status: 404 });

  const clientes = await loadClientes();
  return NextResponse.json({ promo: { title: promo.title }, clientes });
}

function renderPromoEmail(promo: PromoFlyerData, vendedor: string): { subject: string; html: string } {
  const desc = (promo.description ?? "")
    .split("\n")
    .map((l) => (l.trim() ? `<p style="margin:0 0 6px;color:#222">${l}</p>` : "<br/>"))
    .join("");

  const oferta =
    promo.promo_type === "bonificacion" && promo.bonus_per && promo.bonus_qty
      ? `${promo.bonus_per} + ${promo.bonus_qty}`
      : promo.promo_type === "descuento" && promo.discount_pct != null
        ? `${promo.discount_pct}% OFF`
        : null;

  const html = `
    <div style="font-family:Helvetica,Arial,sans-serif;max-width:600px;margin:0 auto;color:#1F1A1C">
      <div style="background:#A91E3A;padding:22px 24px;border-radius:8px 8px 0 0">
        <span style="font-size:24px;letter-spacing:5px;color:#FAF7F2;font-family:Georgia,serif">TERAVINO</span>
        <div style="font-size:9px;letter-spacing:3px;color:#c9a96e;margin-top:2px">WINE &amp; SPIRITS</div>
      </div>
      <div style="border:1px solid #c9a96e;border-top:none;border-radius:0 0 8px 8px;padding:22px 24px">
        <h2 style="color:#A91E3A;font-size:20px;margin:0 0 4px">${promo.title}</h2>
        ${promo.product_name ? `<p style="color:#7A6E70;margin:0 0 14px">${promo.product_name}</p>` : ""}
        ${oferta ? `<div style="display:inline-block;border:2px solid #c9a96e;border-radius:8px;padding:10px 20px;font-size:28px;color:#A91E3A;font-family:Georgia,serif;margin-bottom:14px">${oferta}</div>` : ""}
        <div style="font-size:14px;line-height:1.5;margin:8px 0 14px">${desc}</div>
        <p style="font-size:13px;color:#555;border-top:1px solid #c9a96e;padding-top:12px">
          Adjuntamos el flyer en PDF. Cualquier duda, con gusto te atendemos.<br/>
          Saludos,<br/><strong>${vendedor}</strong><br/>TERAVINO Wine &amp; Spirits
        </p>
      </div>
    </div>`;

  return { subject: promo.title, html };
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const rep = await getCurrentRep();
  if (!rep) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const promo = await loadPromo(params.id);
  if (!promo) return NextResponse.json({ error: "Promoción no encontrada" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const accountIds: string[] = Array.isArray(body?.accountIds)
    ? body.accountIds.filter((x: unknown): x is string => typeof x === "string")
    : [];
  const extraEmails: string[] = Array.isArray(body?.extraEmails)
    ? body.extraEmails.filter((x: unknown): x is string => typeof x === "string")
    : [];

  // Correos de las cuentas seleccionadas (re-validados por RLS). Guardamos el
  // mapeo cuenta→correo para registrar el envío por cliente en la bitácora.
  const supabase = createClient();
  const recipients = new Set<string>();
  const perAccount: { accountId: string; email: string }[] = [];
  if (accountIds.length) {
    const { data } = await supabase
      .from("accounts")
      .select("id, business_name, billing_email, contacts(email, is_primary)")
      .in("id", accountIds);
    for (const a of (data ?? []) as AccountRow[]) {
      const email = bestEmail(a);
      if (email) {
        recipients.add(email.toLowerCase());
        perAccount.push({ accountId: a.id, email: email.toLowerCase() });
      }
    }
  }
  const extras: string[] = [];
  for (const e of extraEmails) {
    const v = e.trim().toLowerCase();
    if (v.includes("@") && v.length <= 254) {
      recipients.add(v);
      extras.push(v);
    }
  }

  const to = Array.from(recipients);
  if (!to.length) {
    return NextResponse.json({ error: "Selecciona al menos un cliente o agrega un correo." }, { status: 400 });
  }

  const pdfBuffer = await renderToBuffer(PromoFlyerPdf({ promo }));
  const pdfBase64 = Buffer.from(pdfBuffer).toString("base64");
  const { subject, html } = renderPromoEmail(promo, rep.full_name);

  try {
    const result = await sendEmail({
      to: rep.email || ventasFrom(),
      bcc: to, // clientes en copia oculta: no se ven entre ellos
      subject,
      html,
      from: ventasFrom(),
      replyTo: rep.email || undefined,
      attachments: [{ filename: "promocion-teravino.pdf", content: pdfBase64 }],
    });
    // Bitácora: una fila por cuenta (para el "último envío" en su ficha) + una
    // fila para los correos sueltos sin cuenta.
    for (const pa of perAccount) {
      await logClientEmail(supabase, {
        accountId: pa.accountId,
        kind: "promocion",
        subject,
        recipients: [pa.email],
        refTable: "promotions",
        refId: params.id,
        resendId: result.id,
        sentBy: rep.id,
      });
    }
    if (extras.length) {
      await logClientEmail(supabase, {
        accountId: null,
        kind: "promocion",
        subject,
        recipients: extras,
        refTable: "promotions",
        refId: params.id,
        resendId: result.id,
        sentBy: rep.id,
      });
    }
    return NextResponse.json({ ok: true, id: result.id, count: to.length });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error al enviar el correo" },
      { status: 502 },
    );
  }
}
