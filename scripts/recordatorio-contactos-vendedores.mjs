#!/usr/bin/env node
// Recordatorio a los vendedores: actualizar los CONTACTOS de sus clientes en el CRM.
//
// Envía UN correo colectivo a todos los vendedores (role = 'rep', activos), con
// copia (CC) a Sabrina. El cuerpo incluye, por vendedor, cuántas cuentas tienen
// asignadas, cuántas no tienen ningún contacto y cuántas no tienen correo de
// contacto — para que cada quien sepa qué le falta capturar.
//
// Envío vía Resend (REST), el mismo proveedor que usa el CRM para cobranza.
//
// Uso:
//   # Vista previa, NO envía (imprime destinatarios + HTML):
//   DRY_RUN=1 node scripts/recordatorio-contactos-vendedores.mjs
//
//   # Envío real:
//   node scripts/recordatorio-contactos-vendedores.mjs
//
// Variables de entorno necesarias para enviar:
//   NEXT_PUBLIC_SUPABASE_URL      URL del proyecto Supabase
//   SUPABASE_SERVICE_ROLE_KEY     service_role (lee todas las cuentas, salta RLS)
//   RESEND_API_KEY                API key de Resend (dominio teravino.com verificado)
// Opcionales:
//   CRM_FROM_EMAIL                Remitente. Default: "TERAVINO CRM <cobranza@teravino.com>"
//   CC_EMAIL                      Copia. Default: sabrina@teravino.com

import { createClient } from "@supabase/supabase-js";

const CC_EMAIL = process.env.CC_EMAIL || "sabrina@teravino.com";
const FROM = process.env.CRM_FROM_EMAIL || "TERAVINO CRM <cobranza@teravino.com>";
const DRY_RUN = process.env.DRY_RUN === "1" || process.argv.includes("--dry-run");

function requireEnv(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`Falta la variable de entorno ${name}.`);
    process.exit(1);
  }
  return v;
}

async function main() {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const key = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 1) Vendedores activos (destinatarios del recordatorio).
  const { data: reps, error: repsErr } = await supabase
    .from("sales_reps")
    .select("id, full_name, email")
    .eq("role", "rep")
    .eq("active", true)
    .order("full_name");
  if (repsErr) throw repsErr;
  if (!reps?.length) {
    console.error("No hay vendedores activos (role='rep').");
    process.exit(1);
  }

  // 2) Métricas por vendedor: cuentas, sin contacto, sin correo de contacto.
  const stats = [];
  for (const rep of reps) {
    const { data: accounts, error: accErr } = await supabase
      .from("accounts")
      .select("id, contacts(id, email)")
      .eq("assigned_rep_id", rep.id)
      .neq("status", "inactive");
    if (accErr) throw accErr;

    const cuentas = accounts?.length ?? 0;
    let sinContacto = 0;
    let sinEmail = 0;
    for (const a of accounts ?? []) {
      const cs = a.contacts ?? [];
      if (cs.length === 0) sinContacto++;
      if (!cs.some((c) => c.email && String(c.email).trim() !== "")) sinEmail++;
    }
    stats.push({ ...rep, cuentas, sinContacto, sinEmail });
  }

  const recipients = reps.map((r) => r.email).filter(Boolean);
  const subject = "Recordatorio: actualizar los contactos de tus clientes en el CRM";
  const html = buildHtml(stats);

  if (DRY_RUN) {
    console.log("== DRY RUN — no se envía ==");
    console.log("From:", FROM);
    console.log("To:  ", recipients.join(", "));
    console.log("Cc:  ", CC_EMAIL);
    console.log("Subject:", subject);
    console.log("\n--- HTML ---\n");
    console.log(html);
    return;
  }

  const resendKey = requireEnv("RESEND_API_KEY");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM,
      to: recipients,
      cc: [CC_EMAIL],
      subject,
      html,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Resend ${res.status}: ${body.slice(0, 400)}`);
  }
  const data = await res.json();
  console.log("Enviado. id:", data.id);
  console.log("To:", recipients.join(", "), "| Cc:", CC_EMAIL);
}

function buildHtml(stats) {
  const rows = stats
    .map(
      (s) => `
      <tr>
        <td style="border:1px solid #ddd;padding:6px 10px;">${escapeHtml(s.full_name)}</td>
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

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[c]);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
