// Cliente de email para cobranza vía Resend (REST, sin SDK).
// SERVER-ONLY. Inicialización lazy: si falta RESEND_API_KEY, lanza un error
// claro al enviar (no al importar). El remitente por defecto es
// cobranza@teravino.com — debe estar verificado en Resend (dominio teravino.com).

import "server-only";

const RESEND_URL = "https://api.resend.com/emails";

export type EmailAttachment = {
  filename: string;
  /** Contenido en base64 (sin el prefijo data:). */
  content: string;
};

export type SendEmailInput = {
  to: string | string[];
  subject: string;
  html: string;
  from?: string;
  replyTo?: string;
  cc?: string | string[];
  attachments?: EmailAttachment[];
};

/** Remitente de cobranza. Configurable por env; default cobranza@teravino.com. */
export function cobranzaFrom(): string {
  return process.env.COBRANZA_FROM_EMAIL || "TERAVINO Cobranza <cobranza@teravino.com>";
}

/** Remitente de ventas/muestras. Mismo dominio verificado (teravino.com). */
export function ventasFrom(): string {
  return process.env.VENTAS_FROM_EMAIL || "TERAVINO <ventas@teravino.com>";
}

/**
 * Remitente para notificaciones generales del CRM. Configurable por env
 * (CRM_FROM_EMAIL); si no, cae al remitente de cobranza (ya verificado en
 * Resend bajo el dominio teravino.com).
 */
export function crmFrom(): string {
  return process.env.CRM_FROM_EMAIL || cobranzaFrom();
}

export async function sendEmail(input: SendEmailInput): Promise<{ id: string }> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    throw new Error(
      "Falta RESEND_API_KEY en el entorno (Vercel → Settings → Environment Variables). " +
        "Además, el dominio teravino.com debe estar verificado en Resend para enviar desde cobranza@teravino.com.",
    );
  }
  const res = await fetch(RESEND_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: input.from || cobranzaFrom(),
      to: Array.isArray(input.to) ? input.to : [input.to],
      subject: input.subject,
      html: input.html,
      ...(input.replyTo ? { reply_to: input.replyTo } : {}),
      ...(input.cc ? { cc: Array.isArray(input.cc) ? input.cc : [input.cc] } : {}),
      ...(input.attachments?.length ? { attachments: input.attachments } : {}),
    }),
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Resend ${res.status}: ${body.slice(0, 300)}`);
  }
  const data = (await res.json()) as { id?: string };
  return { id: data.id ?? "" };
}
