// POST /api/inbound/ventas — Webhook de Resend Inbound (evento email.received).
//
// Flujo: el cliente escribe a ventas@teravino.com → M365 lo entrega a
// pedidos@teravino.com y una regla de flujo de Exchange manda una copia (Bcc)
// al subdominio inbound (MX → Resend) → Resend dispara este webhook.
//
// FASE 1: solo acuse de recibo ("Gracias, recibimos tu pedido"), enhebrado en
// la conversación original. NO registra el pedido ni adjunta estado de cuenta
// (eso es Fase 2).
//
// Seguridad: se verifica la firma del webhook (RESEND_WEBHOOK_SECRET). Sin
// secreto configurado o con firma inválida, se rechaza (no procesamos correo
// sin autenticar). La ruta /api/inbound está exenta del auth de Supabase en el
// middleware.

import { NextResponse } from "next/server";
import { sendEmail, ventasFrom } from "@/lib/email";
import { verifyResendWebhook } from "@/lib/resend-webhook";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { accountsForEmail, createStatementToken } from "@/lib/statement-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OWN_DOMAIN = "teravino.com";
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "https://crm-steel-tau.vercel.app").replace(/\/+$/, "");

type InboundHeader = { name?: string; value?: string };
type InboundData = {
  from?: string | { address?: string; email?: string; name?: string };
  subject?: string;
  headers?: InboundHeader[];
  message_id?: string;
};
type InboundEvent = { type?: string; data?: InboundData };

/** Extrae la dirección de correo de un campo `from` (string "Nombre <a@b>" u objeto). */
function extractEmail(from: InboundData["from"]): string | null {
  if (!from) return null;
  const raw = typeof from === "string" ? from : from.address || from.email || "";
  const m = raw.match(/<([^>]+)>/);
  const candidate = (m ? m[1] : raw).trim().toLowerCase();
  return candidate.includes("@") ? candidate : null;
}

/** Busca una cabecera por nombre (case-insensitive) en el arreglo de headers. */
function header(headers: InboundHeader[] | undefined, name: string): string | null {
  if (!headers) return null;
  const target = name.toLowerCase();
  for (const h of headers) {
    if (h?.name?.toLowerCase() === target && h.value) return h.value;
  }
  return null;
}

/**
 * Decide si NO debemos auto-responder, para evitar bucles y ruido:
 * - remitentes del propio dominio (incluye nuestros propios envíos),
 * - buzones automáticos (no-reply, mailer-daemon, postmaster),
 * - correos marcados como automáticos (Auto-Submitted / Precedence bulk/list).
 */
function isAutoOrLoop(sender: string, data: InboundData): boolean {
  if (sender.endsWith(`@${OWN_DOMAIN}`)) return true;
  const local = sender.split("@")[0];
  if (/^(no-?reply|mailer-daemon|postmaster|bounce|notifications?)$/.test(local)) return true;

  const autoSubmitted = header(data.headers, "Auto-Submitted");
  if (autoSubmitted && autoSubmitted.toLowerCase() !== "no") return true;

  const precedence = header(data.headers, "Precedence")?.toLowerCase();
  if (precedence && ["bulk", "list", "junk", "auto_reply"].includes(precedence)) return true;

  if (header(data.headers, "X-Autoreply") || header(data.headers, "X-Autorespond")) return true;

  return false;
}

/** Cuerpo del acuse. Si hay link de estado de cuenta, se agrega el botón. */
function acuseHtml(estadoUrl: string | null): string {
  const linkBlock = estadoUrl
    ? `<p style="margin:20px 0;">Mientras tanto, aquí puedes consultar tu estado de cuenta:</p>
       <p style="margin:0 0 8px;">
         <a href="${estadoUrl}" style="display:inline-block;background:#7a1220;color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:10px 20px;border-radius:6px;">Ver mi estado de cuenta</a>
       </p>
       <p style="color:#888;font-size:12px;">Este enlace es personal y tiene una vigencia limitada.</p>`
    : "";
  return `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#222;line-height:1.5;">
    <p>¡Gracias! Hemos recibido tu pedido. 🍷</p>
    <p>Nuestro equipo lo está revisando y te contactaremos en breve para confirmarlo.</p>
    ${linkBlock}
    <p style="color:#666;font-size:13px;margin-top:24px;">TERAVINO · Este es un acuse automático; puedes responder a este correo si necesitas algo.</p>
  </div>`;
}

export async function POST(req: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "Falta RESEND_WEBHOOK_SECRET en el entorno" },
      { status: 500 },
    );
  }

  const rawBody = await req.text();
  const verdict = verifyResendWebhook(rawBody, req.headers, secret);
  if (!verdict.ok) {
    return NextResponse.json({ error: verdict.error }, { status: 401 });
  }

  let event: InboundEvent;
  try {
    event = JSON.parse(rawBody) as InboundEvent;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  // Ignoramos cualquier evento que no sea correo entrante (200 para que Resend
  // no reintente).
  if (event.type !== "email.received" || !event.data) {
    return NextResponse.json({ ok: true, skipped: "evento no aplicable" });
  }

  const sender = extractEmail(event.data.from);
  if (!sender) {
    return NextResponse.json({ ok: true, skipped: "sin remitente" });
  }

  if (isAutoOrLoop(sender, event.data)) {
    return NextResponse.json({ ok: true, skipped: "remitente automático / mismo dominio" });
  }

  // Link al estado de cuenta SOLO si el remitente coincide, de forma única,
  // con un contacto registrado de una cuenta. Sin match → acuse genérico.
  // Ambiguo (varias cuentas) → genérico, para no exponer datos por error.
  let estadoUrl: string | null = null;
  let matchInfo: "ninguno" | "unico" | "ambiguo" = "ninguno";
  try {
    const admin = supabaseAdmin();
    const accountIds = await accountsForEmail(admin, sender);
    if (accountIds.length === 1) {
      matchInfo = "unico";
      const token = await createStatementToken(admin, accountIds[0], { forEmail: sender });
      estadoUrl = `${APP_URL}/estado/${token}`;
    } else if (accountIds.length > 1) {
      matchInfo = "ambiguo";
    }
  } catch {
    // Si falla el cruce/token, seguimos con el acuse genérico (no rompemos el
    // acuse por un problema de BD).
    estadoUrl = null;
  }

  // Enhebrar el acuse en la conversación original (In-Reply-To / References).
  const originalId = event.data.message_id || header(event.data.headers, "Message-ID");
  const threadHeaders = originalId
    ? { "In-Reply-To": originalId, References: originalId }
    : undefined;

  try {
    const result = await sendEmail({
      to: sender,
      from: ventasFrom(),
      subject: "Gracias, recibimos tu pedido",
      html: acuseHtml(estadoUrl),
      ...(threadHeaders ? { headers: threadHeaders } : {}),
    });
    return NextResponse.json({ ok: true, replied: sender, id: result.id, match: matchInfo });
  } catch (e) {
    // Devolvemos 502 para que Resend reintente el webhook si el envío falló.
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error al enviar el acuse" },
      { status: 502 },
    );
  }
}
