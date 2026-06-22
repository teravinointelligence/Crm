// Bitácora de correos enviados a clientes. Helper best-effort: si algo falla
// (RLS, columna, etc.) NO debe romper el envío — solo registra el último envío
// por cuenta/tipo. Ver migración 0072_client_email_log.

import type { SupabaseClient } from "@supabase/supabase-js";

export type ClientEmailKind =
  | "portafolio"
  | "estado_cuenta"
  | "promocion"
  | "requisitos"
  | "muestra"
  | "cobranza"
  | "pedido"
  | "invitacion"
  | "otro";

export const EMAIL_KIND_LABEL: Record<ClientEmailKind, string> = {
  portafolio: "Portafolio",
  estado_cuenta: "Estado de cuenta",
  promocion: "Promoción",
  requisitos: "Requisitos",
  muestra: "Muestras",
  cobranza: "Cobranza",
  pedido: "Pedido",
  invitacion: "Invitación a evento",
  otro: "Otro",
};

export type LogClientEmailInput = {
  accountId?: string | null;
  kind: ClientEmailKind;
  subject?: string | null;
  recipients: string | string[];
  refTable?: string | null;
  refId?: string | null;
  resendId?: string | null;
  sentBy?: string | null;
};

/**
 * Registra un envío a cliente. Best-effort: nunca lanza.
 * Usa el cliente Supabase de la sesión (RLS) del endpoint que envió el correo.
 */
export async function logClientEmail(
  supabase: SupabaseClient,
  input: LogClientEmailInput,
): Promise<void> {
  try {
    const recipients = (Array.isArray(input.recipients) ? input.recipients : [input.recipients])
      .map((e) => (typeof e === "string" ? e.trim() : ""))
      .filter(Boolean);

    await supabase.from("client_email_log").insert({
      account_id: input.accountId ?? null,
      kind: input.kind,
      subject: input.subject ?? null,
      recipients,
      recipient_count: recipients.length,
      ref_table: input.refTable ?? null,
      ref_id: input.refId ?? null,
      resend_id: input.resendId ?? null,
      sent_by: input.sentBy ?? null,
    });
  } catch {
    // best-effort: no romper el flujo de envío
  }
}
