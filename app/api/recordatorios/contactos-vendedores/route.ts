// POST /api/recordatorios/contactos-vendedores
//
// Envía UN correo colectivo a todos los vendedores (sales_reps role='rep'
// activos) recordándoles actualizar los contactos de sus clientes en el CRM,
// con copia (CC) a Sabrina. El cuerpo incluye, por vendedor, cuántas cuentas
// tiene asignadas, cuántas no tienen ningún contacto y cuántas no tienen correo
// de contacto.
//
// Auth: solo admin. Envío vía Resend (lib/email.ts).

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRep } from "@/lib/auth";
import { sendEmail, crmFrom } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CC_EMAIL = process.env.RECORDATORIO_CC_EMAIL || "sabrina@teravino.com";

type RepStat = {
  full_name: string;
  email: string;
  cuentas: number;
  sinContacto: number;
  sinEmail: number;
};

export async function POST() {
  const rep = await getCurrentRep();
  if (!rep) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (rep.role !== "admin") {
    return NextResponse.json({ error: "Solo un administrador puede enviar este recordatorio." }, { status: 403 });
  }

  const supabase = createClient();

  // Vendedores activos (destinatarios). El admin ve todos por RLS.
  const { data: reps } = await supabase
    .from("sales_reps")
    .select("id, full_name, email")
    .eq("role", "rep")
    .eq("active", true)
    .order("full_name");

  if (!reps?.length) {
    return NextResponse.json({ error: "No hay vendedores activos." }, { status: 400 });
  }

  // Cuentas (con sus contactos) para calcular las métricas por vendedor.
  const { data: accounts } = await supabase
    .from("accounts")
    .select("id, assigned_rep_id, status, contacts(id, email)")
    .neq("status", "inactive");

  type Acc = { assigned_rep_id: string | null; contacts: { email: string | null }[] | null };
  const byRep = new Map<string, Acc[]>();
  for (const a of (accounts ?? []) as Acc[]) {
    if (!a.assigned_rep_id) continue;
    const arr = byRep.get(a.assigned_rep_id) ?? [];
    arr.push(a);
    byRep.set(a.assigned_rep_id, arr);
  }

  const stats: RepStat[] = reps.map((r) => {
    const accs = byRep.get(r.id) ?? [];
    let sinContacto = 0;
    let sinEmail = 0;
    for (const a of accs) {
      const cs = a.contacts ?? [];
      if (cs.length === 0) sinContacto++;
      if (!cs.some((c) => c.email && String(c.email).trim() !== "")) sinEmail++;
    }
    return { full_name: r.full_name, email: r.email, cuentas: accs.length, sinContacto, sinEmail };
  });

  const recipients = reps.map((r) => r.email).filter(Boolean) as string[];
  const html = buildHtml(stats);

  try {
    const result = await sendEmail({
      from: crmFrom(),
      to: recipients,
      cc: CC_EMAIL,
      subject: "Recordatorio: actualizar los contactos de tus clientes en el CRM",
      html,
    });
    return NextResponse.json({ ok: true, id: result.id, to: recipients, cc: CC_EMAIL });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error al enviar el correo" },
      { status: 502 },
    );
  }
}

function esc(s: string) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string,
  );
}

function buildHtml(stats: RepStat[]) {
  const rows = stats
    .map(
      (s) => `
      <tr>
        <td style="border:1px solid #ddd;padding:6px 10px;">${esc(s.full_name)}</td>
        <td style="border:1px solid #ddd;padding:6px 10px;text-align:right;">${s.cuentas}</td>
        <td style="border:1px solid #ddd;padding:6px 10px;text-align:right;">${s.sinContacto}</td>
        <td style="border:1px solid #ddd;padding:6px 10px;text-align:right;">${s.sinEmail}</td>
      </tr>`,
    )
    .join("");

  return `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:0 auto;color:#222;font-size:14px;line-height:1.5;">
    <h2 style="color:#7a1220;margin:0 0 12px;">TERAVINO — Recordatorio de contactos</h2>
    <p>Hola equipo,</p>
    <p>Necesitamos poner al día los <strong>contactos de sus clientes</strong> en el CRM
       (nombre, puesto, teléfono/WhatsApp y, sobre todo, el <strong>correo electrónico</strong>).</p>
    <p>Tener el contacto correcto de cada cuenta nos permite enviar cotizaciones, estados de
       cuenta y avisos sin retrasos, y evita que las comunicaciones se queden sin destinatario.</p>
    <p style="margin-bottom:6px;"><strong>Estado actual por vendedor</strong> (cuentas asignadas):</p>
    <table style="border-collapse:collapse;font-size:13px;margin:8px 0;">
      <thead>
        <tr style="background:#7a1220;color:#fff;text-align:left;">
          <th style="border:1px solid #ddd;padding:6px 10px;">Vendedor</th>
          <th style="border:1px solid #ddd;padding:6px 10px;text-align:right;">Cuentas</th>
          <th style="border:1px solid #ddd;padding:6px 10px;text-align:right;">Sin ningún contacto</th>
          <th style="border:1px solid #ddd;padding:6px 10px;text-align:right;">Sin correo de contacto</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <p style="margin-top:16px;"><strong>¿Qué les pedimos?</strong></p>
    <ol>
      <li>Entrar al CRM, sección <strong>Cuentas</strong>, y revisar las que aparecen sin contacto.</li>
      <li>Agregar al menos un contacto por cuenta, marcando el <strong>principal</strong>.</li>
      <li>Capturar el <strong>correo electrónico</strong> y el <strong>teléfono/WhatsApp</strong> de cada contacto.</li>
    </ol>
    <p>Meta: dejar en <strong>cero</strong> las cuentas «sin contacto» antes del viernes.</p>
    <p>Cualquier duda con la captura, escríbanle a Sabrina (en copia).</p>
    <p>¡Gracias por el apoyo!</p>
    <p style="color:#666;font-size:13px;margin-top:24px;">Equipo TERAVINO</p>
  </div>`;
}
