// POST /api/cartera/[accountId]/recordatorio
//
// Envía un recordatorio de pago al cliente con su estado de cuenta (facturas
// abiertas + saldo + semáforo) desde cobranza@teravino.com vía Resend.
//
// Auth: admin o el vendedor asignado a la cuenta. El destinatario es el email
// del contacto principal de la cuenta (o cualquier contacto con email).

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRep } from "@/lib/auth";
import { sendEmail, cobranzaFrom } from "@/lib/email";
import { semaforoCobranza } from "@/lib/cobranza";
import type { Invoice } from "@/types/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const fmt = (n: number | null | undefined) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 2 }).format(Number(n ?? 0));
const fmtDate = (d: string | null | undefined) =>
  d ? new Intl.DateTimeFormat("es-MX", { dateStyle: "medium" }).format(new Date(d)) : "—";

export async function POST(_req: Request, { params }: { params: { accountId: string } }) {
  const rep = await getCurrentRep();
  if (!rep) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const supabase = createClient();

  // La RLS ya restringe accounts al admin o al rep dueño; si no la ve, 404.
  const { data: account } = await supabase
    .from("accounts")
    .select("id, business_name, fiscal_name, assigned_rep_id")
    .eq("id", params.accountId)
    .maybeSingle();
  if (!account) return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 });

  const [{ data: contacts }, { data: invoices }, { data: balance }] = await Promise.all([
    supabase
      .from("contacts")
      .select("full_name, email, is_primary")
      .eq("account_id", params.accountId)
      .not("email", "is", null)
      .order("is_primary", { ascending: false }),
    supabase
      .from("invoices")
      .select("invoice_number, invoice_date, due_date, total, total_paid, balance, status")
      .eq("account_id", params.accountId)
      .neq("status", "cancelada")
      .gt("balance", 0)
      .order("due_date", { ascending: true }),
    supabase
      .from("v_account_balance")
      .select("saldo_pendiente, saldo_vencido, dias_vencido")
      .eq("account_id", params.accountId)
      .maybeSingle(),
  ]);

  const contact = (contacts ?? [])[0] as { full_name: string; email: string } | undefined;
  if (!contact?.email) {
    return NextResponse.json(
      { error: "El cliente no tiene un contacto con email. Agrégalo en la ficha de la cuenta." },
      { status: 400 },
    );
  }

  const open = (invoices ?? []) as Pick<Invoice, "invoice_number" | "invoice_date" | "due_date" | "total" | "total_paid" | "balance" | "status">[];
  if (!open.length) {
    return NextResponse.json({ error: "Este cliente no tiene facturas con saldo pendiente." }, { status: 400 });
  }

  const semaforo = semaforoCobranza(balance?.dias_vencido, balance?.saldo_pendiente);
  const today = new Date();
  const rows = open
    .map((i) => {
      const overdue = i.due_date && new Date(i.due_date) < today && (i.balance ?? 0) > 0;
      const dias = i.due_date && overdue
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

  try {
    const result = await sendEmail({
      to: contact.email,
      subject: `Estado de cuenta TERAVINO — ${cliente}`,
      html,
      replyTo: cobranzaFrom().replace(/^.*<|>$/g, "").trim() || "cobranza@teravino.com",
    });
    return NextResponse.json({ ok: true, id: result.id, to: contact.email, estado: semaforo.estado });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error al enviar el correo" },
      { status: 502 },
    );
  }
}
