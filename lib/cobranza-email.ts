// Armado del correo de cobranza (estado de cuenta) para un cliente.
// Compartido entre la vista previa (GET, borrador) y el envío real (POST) del
// endpoint /api/cartera/[accountId]/recordatorio. NO envía nada por sí mismo.

import type { createClient } from "@/lib/supabase/server";
import { semaforoCobranza, type EstadoCobranza } from "@/lib/cobranza";
import type { Invoice } from "@/types/database";

type DbClient = ReturnType<typeof createClient>;

const fmt = (n: number | null | undefined) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 2 }).format(Number(n ?? 0));
const fmtDate = (d: string | null | undefined) =>
  d ? new Intl.DateTimeFormat("es-MX", { dateStyle: "medium" }).format(new Date(d)) : "—";

export type RecordatorioResult =
  | { ok: true; to: string; subject: string; html: string; estado: EstadoCobranza }
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
      .select("full_name, email, is_primary")
      .eq("account_id", accountId)
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
      .select("saldo_pendiente, saldo_vencido, dias_vencido")
      .eq("account_id", accountId)
      .maybeSingle(),
  ]);

  const contact = (contacts ?? [])[0] as { full_name: string; email: string } | undefined;
  if (!contact?.email) {
    return {
      ok: false,
      status: 400,
      error: "El cliente no tiene un contacto con email. Agrégalo en la ficha de la cuenta.",
    };
  }

  const open = (invoices ?? []) as Pick<
    Invoice,
    "invoice_number" | "invoice_date" | "due_date" | "total" | "total_paid" | "balance" | "status"
  >[];
  if (!open.length) {
    return { ok: false, status: 400, error: "Este cliente no tiene facturas con saldo pendiente." };
  }

  const semaforo = semaforoCobranza(balance?.dias_vencido, balance?.saldo_pendiente);
  const today = new Date();
  const rows = open
    .map((i) => {
      const overdue = i.due_date && new Date(i.due_date) < today && (i.balance ?? 0) > 0;
      const dias =
        i.due_date && overdue
          ? Math.floor((today.getTime() - new Date(i.due_date).getTime()) / 86400000)
          : 0;
      return `
        <tr>
          <td style="padding:6px 10px;border-bottom:1px solid #eee;">${i.invoice_number}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #eee;">${fmtDate(i.invoice_date)}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #eee;color:${overdue ? "#b91c1c" : "#555"};">${fmtDate(i.due_date)}${dias ? ` (${dias} d)` : ""}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right;">${fmt(i.total)}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right;font-weight:600;">${fmt(i.balance)}</td>
        </tr>`;
    })
    .join("");

  const cliente = account.fiscal_name || account.business_name;
  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:0 auto;color:#222;">
    <h2 style="color:#7a1220;margin:0 0 4px;">TERAVINO — Estado de cuenta</h2>
    <p style="margin:0 0 16px;color:#666;">${cliente}</p>
    <p>Estimado cliente,</p>
    <p>Le compartimos su estado de cuenta con TERAVINO. Apreciamos su preferencia y le recordamos los siguientes saldos pendientes:</p>
    <table style="border-collapse:collapse;width:100%;font-size:14px;margin:12px 0;">
      <thead>
        <tr style="background:#f6f1ee;text-align:left;">
          <th style="padding:6px 10px;">Folio</th>
          <th style="padding:6px 10px;">Emisión</th>
          <th style="padding:6px 10px;">Vencimiento</th>
          <th style="padding:6px 10px;text-align:right;">Total</th>
          <th style="padding:6px 10px;text-align:right;">Saldo</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <table style="font-size:14px;margin:8px 0;">
      <tr><td style="padding:2px 10px;color:#666;">Saldo pendiente:</td><td style="padding:2px 10px;font-weight:600;">${fmt(balance?.saldo_pendiente)}</td></tr>
      <tr><td style="padding:2px 10px;color:#666;">Saldo vencido:</td><td style="padding:2px 10px;font-weight:600;color:#b91c1c;">${fmt(balance?.saldo_vencido)}</td></tr>
    </table>
    <p style="margin-top:16px;">Le agradecemos realizar el pago a la brevedad. Si ya realizó el pago, por favor ignore este mensaje o envíenos su comprobante respondiendo a este correo.</p>
    <p style="color:#666;font-size:13px;margin-top:24px;">Cobranza TERAVINO · cobranza@teravino.com</p>
  </div>`;

  return {
    ok: true,
    to: contact.email,
    subject: `Estado de cuenta TERAVINO — ${cliente}`,
    html,
    estado: semaforo.estado,
  };
}
