// Armado del correo de cobranza (estado de cuenta) para un cliente.
// Compartido entre la vista previa (GET, borrador) y el envío real (POST) del
// endpoint /api/cartera/[accountId]/recordatorio. NO envía nada por sí mismo.

import type { createClient } from "@/lib/supabase/server";
import { semaforoCobranza, type EstadoCobranza } from "@/lib/cobranza";
import { statementRecipientEmails } from "@/lib/statement-recipients";
import type { Invoice } from "@/types/database";

type DbClient = ReturnType<typeof createClient>;

const fmt = (n: number | null | undefined) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 2 }).format(Number(n ?? 0));
const fmtDate = (d: string | null | undefined) =>
  d ? new Intl.DateTimeFormat("es-MX", { dateStyle: "medium" }).format(new Date(d)) : "—";

const escapeHtml = (value: string | null | undefined) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

export type RecordatorioResult =
  | { ok: true; to: string[]; subject: string; html: string; estado: EstadoCobranza }
  | { ok: false; status: number; error: string };

export async function buildRecordatorio(
  supabase: DbClient,
  accountId: string,
): Promise<RecordatorioResult> {
  // La RLS restringe accounts al admin o al rep dueño; si no la ve, 404.
  const { data: account } = await supabase
    .from("accounts")
    .select("id, business_name, fiscal_name, assigned_rep_id")
    .eq("id", accountId)
    .maybeSingle();
  if (!account) return { ok: false, status: 404, error: "Cuenta no encontrada" };

  const [{ data: contacts }, { data: invoices }, { data: balance }] = await Promise.all([
    supabase
      .from("contacts")
      .select("full_name, email, is_primary, receives_statement")
      .eq("account_id", accountId)
      .eq("receives_statement", true)
      .not("email", "is", null)
      .order("is_primary", { ascending: false }),
    supabase
      .from("invoices")
      .select("invoice_number, invoice_date, due_date, total, total_paid, balance, status")
      .eq("account_id", accountId)
      .neq("status", "cancelada")
      .gt("balance", 0)
      .order("due_date", { ascending: true }),
    supabase
      .from("v_account_balance")
      .select("saldo_pendiente, saldo_vencido, dias_vencido, total_pagado")
      .eq("account_id", accountId)
      .maybeSingle(),
  ]);

  const to = statementRecipientEmails(contacts ?? []);
  if (!to.length) {
    return {
      ok: false,
      status: 400,
      error:
        "Selecciona al menos un contacto con email para recibir el estado de cuenta en la pestaña Contactos.",
    };
  }

  const open = (invoices ?? []) as Pick<
    Invoice,
    "invoice_number" | "invoice_date" | "due_date" | "total" | "total_paid" | "balance" | "status"
  >[];
  if (!open.length) {
    return { ok: false, status: 400, error: "Este cliente no tiene facturas con saldo pendiente." };
  }

  const semaforo = semaforoCobranza(
    balance?.dias_vencido,
    balance?.saldo_pendiente,
    balance?.total_pagado,
  );
  const today = new Date();
  const rows = open
    .map((i) => {
      const overdue = i.due_date && new Date(i.due_date) < today && (i.balance ?? 0) > 0;
      const dias =
        i.due_date && overdue
          ? Math.floor((today.getTime() - new Date(i.due_date).getTime()) / 86400000)
          : 0;
      const status = overdue ? `${dias} ${dias === 1 ? "día vencido" : "días vencidos"}` : "Por vencer";
      return `
        <tr>
          <td style="padding:12px 10px;border-bottom:1px solid #eadfd9;font-weight:700;color:#33272a;">${escapeHtml(i.invoice_number)}</td>
          <td style="padding:12px 10px;border-bottom:1px solid #eadfd9;color:#62575a;white-space:nowrap;">${fmtDate(i.invoice_date)}</td>
          <td style="padding:12px 10px;border-bottom:1px solid #eadfd9;color:#62575a;white-space:nowrap;">${fmtDate(i.due_date)}</td>
          <td style="padding:12px 10px;border-bottom:1px solid #eadfd9;color:${overdue ? "#a91e3a" : "#62575a"};font-weight:${overdue ? "700" : "400"};">${status}</td>
          <td style="padding:12px 10px;border-bottom:1px solid #eadfd9;text-align:right;font-weight:700;white-space:nowrap;">${fmt(i.balance)}</td>
        </tr>`;
    })
    .join("");

  const cliente = account.fiscal_name || account.business_name;
  const fechaCorte = fmtDate(today.toISOString());
  const saldoPendiente = fmt(balance?.saldo_pendiente);
  const saldoVencido = fmt(balance?.saldo_vencido);
  const html = `
  <!doctype html>
  <html lang="es">
    <body style="margin:0;padding:0;background:#f4f0eb;">
      <div style="display:none;max-height:0;overflow:hidden;opacity:0;">Estado de cuenta al ${fechaCorte}: saldo pendiente ${saldoPendiente}.</div>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f0eb;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;color:#33272a;">
        <tr><td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:680px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e6dbd3;">
            <tr><td style="height:6px;background:#a91e3a;font-size:0;">&nbsp;</td></tr>
            <tr><td style="padding:28px 32px 22px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>
                <td style="font-family:Georgia,'Times New Roman',serif;font-size:25px;letter-spacing:5px;color:#a91e3a;">TERAVINO</td>
                <td align="right" style="font-size:12px;color:#7a6e70;">CORTE AL<br><strong style="color:#33272a;">${fechaCorte}</strong></td>
              </tr></table>
            </td></tr>
            <tr><td style="padding:0 32px 8px;">
              <p style="margin:0 0 6px;color:#a91e3a;font-size:12px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;">Estado de cuenta</p>
              <h1 style="margin:0 0 20px;font-family:Georgia,'Times New Roman',serif;font-size:26px;font-weight:400;color:#33272a;">${escapeHtml(cliente)}</h1>
              <p style="margin:0 0 20px;font-size:15px;line-height:1.65;color:#554b4e;">Estimado cliente:</p>
              <p style="margin:0 0 24px;font-size:15px;line-height:1.65;color:#554b4e;">Compartimos el resumen actualizado de su cuenta con TERAVINO. Agradecemos su preferencia y quedamos a su disposición para aclarar cualquier movimiento.</p>

              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 26px;"><tr>
                <td width="50%" style="padding:18px;background:#faf7f2;border:1px solid #eadfd9;border-radius:8px 0 0 8px;">
                  <div style="font-size:11px;letter-spacing:1px;color:#7a6e70;text-transform:uppercase;margin-bottom:6px;">Saldo pendiente</div>
                  <div style="font-family:Georgia,'Times New Roman',serif;font-size:23px;color:#33272a;white-space:nowrap;">${saldoPendiente}</div>
                </td>
                <td width="50%" style="padding:18px;background:#fff7f7;border:1px solid #eadfd9;border-left:0;border-radius:0 8px 8px 0;">
                  <div style="font-size:11px;letter-spacing:1px;color:#7a6e70;text-transform:uppercase;margin-bottom:6px;">Saldo vencido</div>
                  <div style="font-family:Georgia,'Times New Roman',serif;font-size:23px;color:#a91e3a;white-space:nowrap;">${saldoVencido}</div>
                </td>
              </tr></table>

              <h2 style="margin:0 0 10px;font-size:13px;color:#a91e3a;letter-spacing:1px;text-transform:uppercase;">Detalle de facturas pendientes</h2>
              <div style="overflow-x:auto;">
                <table role="table" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;font-size:13px;min-width:600px;">
                  <thead><tr style="background:#f5eee9;text-align:left;color:#685c60;">
                    <th style="padding:10px;">Folio</th>
                    <th style="padding:10px;">Emisión</th>
                    <th style="padding:10px;">Vencimiento</th>
                    <th style="padding:10px;">Estatus</th>
                    <th style="padding:10px;text-align:right;">Saldo</th>
                  </tr></thead>
                  <tbody>${rows}</tbody>
                </table>
              </div>

              <div style="margin:26px 0 0;padding:18px 20px;background:#faf7f2;border-left:4px solid #c9a96e;border-radius:4px;">
                <p style="margin:0;font-size:14px;line-height:1.6;color:#554b4e;">Si ya realizó su pago, puede responder a este correo con el comprobante para ayudarnos a identificarlo. De lo contrario, agradeceremos programar la liquidación de los saldos vencidos.</p>
              </div>
              <p style="margin:24px 0 4px;font-size:14px;line-height:1.6;">Atentamente,<br><strong>Equipo de Cobranza TERAVINO</strong></p>
              <p style="margin:0;font-size:13px;"><a href="mailto:cobranza@teravino.com" style="color:#a91e3a;text-decoration:none;">cobranza@teravino.com</a></p>
            </td></tr>
            <tr><td style="padding:18px 32px;background:#33272a;color:#d9ceca;font-size:11px;line-height:1.5;text-align:center;">Este mensaje contiene información confidencial de su cuenta. Si recibió este correo por error, por favor notifíquenos.</td></tr>
          </table>
        </td></tr>
      </table>
    </body>
  </html>`;

  return {
    ok: true,
    to,
    subject: `Estado de cuenta TERAVINO — ${cliente}`,
    html,
    estado: semaforo.estado,
  };
}
