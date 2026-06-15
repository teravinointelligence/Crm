// Datos y "bloque de cifras" para la cobranza inteligente. SERVER-ONLY.
//
// Clave del diseño: las CIFRAS (folios, montos, fechas, totales) las arma el
// CÓDIGO aquí. El LLM solo escribe la prosa y nunca toca números → cero riesgo
// de cifras inventadas. La prosa y este bloque se concatenan al final.

import "server-only";
import type { createClient } from "@/lib/supabase/server";
import { formatCurrency, formatDate } from "@/lib/utils";

type DbClient = ReturnType<typeof createClient>;

export type Tono = "amable" | "firme" | "formal";

export const TONO_LABEL: Record<Tono, string> = {
  amable: "Amable",
  firme: "Firme pero cordial",
  formal: "Formal (suspensión)",
};

/** Tono según el máximo de días vencidos. 45+ = formal (suspensión). */
export function tonoDeDias(diasVencido: number): Tono {
  if (diasVencido <= 15) return "amable";
  if (diasVencido <= 45) return "firme";
  return "formal";
}

export type OpenInvoice = {
  invoice_number: string;
  invoice_date: string | null;
  due_date: string | null;
  total: number | null;
  balance: number | null;
};

export type CobranzaData = {
  account: { id: string; business_name: string; fiscal_name: string | null };
  cliente: string;
  emails: string[];
  /** Teléfono normalizado para wa.me (solo dígitos, con lada país) o null. */
  whatsapp: string | null;
  invoices: OpenInvoice[];
  saldo_pendiente: number;
  saldo_vencido: number;
  dias_vencido: number;
  tono: Tono;
  suspendido: boolean;
};

export type CobranzaDataResult =
  | { ok: true; data: CobranzaData }
  | { ok: false; status: number; error: string };

/** Normaliza un teléfono mexicano a dígitos con lada país (52) para wa.me. */
export function normalizeWhatsapp(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let d = String(raw).replace(/\D/g, "");
  if (!d) return null;
  if (d.length === 10) d = "52" + d; // celular MX sin lada país
  else if (d.length === 11 && d.startsWith("1")) d = "52" + d.slice(1);
  else if (d.length === 12 && d.startsWith("52")) {
    /* ya trae 52 + 10 */
  } else if (d.length === 13 && d.startsWith("521")) d = "52" + d.slice(3);
  // Si no calza ningún patrón conocido, lo devolvemos tal cual (mejor algo que nada).
  return d;
}

/** Recolecta todo lo necesario de una cuenta para la cobranza. */
export async function getCobranzaData(
  supabase: DbClient,
  accountId: string,
): Promise<CobranzaDataResult> {
  const { data: account } = await supabase
    .from("accounts")
    .select("id, business_name, fiscal_name")
    .eq("id", accountId)
    .maybeSingle();
  if (!account) return { ok: false, status: 404, error: "Cuenta no encontrada" };

  const [{ data: contacts }, { data: invoices }, { data: balance }] = await Promise.all([
    supabase
      .from("contacts")
      .select("email, phone, whatsapp, is_primary")
      .eq("account_id", accountId)
      .order("is_primary", { ascending: false }),
    supabase
      .from("invoices")
      .select("invoice_number, invoice_date, due_date, total, balance, status")
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

  // Correos deduplicados (principal primero).
  const seen = new Set<string>();
  const emails: string[] = [];
  for (const c of (contacts ?? []) as { email: string | null }[]) {
    const email = c.email?.trim();
    if (!email || !email.includes("@")) continue;
    const key = email.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      emails.push(email);
    }
  }

  // WhatsApp: primer contacto con whatsapp; si no, primer phone.
  let whatsapp: string | null = null;
  for (const c of (contacts ?? []) as { whatsapp: string | null; phone: string | null }[]) {
    whatsapp = normalizeWhatsapp(c.whatsapp) || normalizeWhatsapp(c.phone);
    if (whatsapp) break;
  }

  const open = (invoices ?? []) as OpenInvoice[];
  if (!open.length) {
    return { ok: false, status: 400, error: "Este cliente no tiene facturas con saldo pendiente." };
  }

  const dias = Number(balance?.dias_vencido ?? 0);
  const tono = tonoDeDias(dias);

  return {
    ok: true,
    data: {
      account,
      cliente: account.fiscal_name || account.business_name,
      emails,
      whatsapp,
      invoices: open,
      saldo_pendiente: Number(balance?.saldo_pendiente ?? 0),
      saldo_vencido: Number(balance?.saldo_vencido ?? 0),
      dias_vencido: dias,
      tono,
      suspendido: tono === "formal",
    },
  };
}

// --- Render de CIFRAS (código, nunca el LLM) -------------------------------

/** Tabla de facturas en HTML (para el correo). */
export function renderFactsHtml(d: CobranzaData): string {
  const today = new Date();
  const rows = d.invoices
    .map((i) => {
      const overdue = i.due_date && new Date(i.due_date) < today && (i.balance ?? 0) > 0;
      const dias =
        i.due_date && overdue
          ? Math.floor((today.getTime() - new Date(i.due_date).getTime()) / 86400000)
          : 0;
      return `
      <tr>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;">${i.invoice_number}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;">${formatDate(i.invoice_date)}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;color:${overdue ? "#b91c1c" : "#555"};">${formatDate(i.due_date)}${dias ? ` (${dias} d)` : ""}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right;font-weight:600;">${formatCurrency(i.balance)}</td>
      </tr>`;
    })
    .join("");

  return `
  <table style="border-collapse:collapse;width:100%;font-size:14px;margin:12px 0;">
    <thead>
      <tr style="background:#f6f1ee;text-align:left;">
        <th style="padding:6px 10px;">Folio</th>
        <th style="padding:6px 10px;">Emisión</th>
        <th style="padding:6px 10px;">Vencimiento</th>
        <th style="padding:6px 10px;text-align:right;">Saldo</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <table style="font-size:14px;margin:8px 0;">
    <tr><td style="padding:2px 10px;color:#666;">Saldo pendiente:</td><td style="padding:2px 10px;font-weight:600;">${formatCurrency(d.saldo_pendiente)}</td></tr>
    <tr><td style="padding:2px 10px;color:#666;">Saldo vencido:</td><td style="padding:2px 10px;font-weight:600;color:#b91c1c;">${formatCurrency(d.saldo_vencido)}</td></tr>
  </table>`;
}

/** Lista de facturas en texto plano (para WhatsApp / vista previa). */
export function renderFactsText(d: CobranzaData): string {
  const lines = d.invoices.map(
    (i) => `• ${i.invoice_number} — vence ${formatDate(i.due_date)} — ${formatCurrency(i.balance)}`,
  );
  lines.push("");
  lines.push(`Saldo pendiente: ${formatCurrency(d.saldo_pendiente)}`);
  lines.push(`Saldo vencido: ${formatCurrency(d.saldo_vencido)}`);
  return lines.join("\n");
}
