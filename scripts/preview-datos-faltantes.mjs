// Reproduce EXACTAMENTE lo que el cron /api/cron/datos-faltantes habría enviado
// (criterio: sin_contactos). Usa el service-role local. NO envía nada: solo
// imprime el resumen y guarda el HTML de cada vendedor en /tmp/datos-faltantes/.
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

// --- cargar .env.local ---
const env = {};
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const ESTADOS = ["activo", "prospecto"];
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function buildHtml(repName, accounts) {
  const rows = accounts.map((a) => `
        <tr>
          <td style="padding:6px 10px;border-bottom:1px solid #eee;font-weight:600;">${escapeHtml(a)}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #eee;color:#b45309;">Sin ningún contacto</td>
        </tr>`).join("");
  return `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:680px;margin:0 auto;color:#222;">
    <h2 style="color:#7a1220;margin:0 0 4px;">TERAVINO — Cuentas con datos pendientes</h2>
    <p style="margin:0 0 16px;color:#666;">Hola ${escapeHtml(repName)}, estas cuentas que tienes asignadas necesitan que completes su registro:</p>
    <table style="border-collapse:collapse;width:100%;font-size:14px;margin:12px 0;">
      <thead><tr style="background:#f6f1ee;text-align:left;"><th style="padding:6px 10px;">Cliente</th><th style="padding:6px 10px;">Qué falta</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p style="margin-top:16px;">Por favor entra al CRM, abre cada cuenta y completa los datos faltantes (contactos con email y teléfono, contacto de cuentas por pagar, y datos fiscales). Tener esto al día nos permite facturar y cobrar sin fricción.</p>
    <p style="color:#666;font-size:13px;margin-top:24px;">TERAVINO · CRM</p>
  </div>`;
}

// 1) vendedores activos
const { data: reps } = await supabase.from("sales_reps").select("id, full_name, email, active").eq("active", true);

// 2) cuentas activas/prospecto
const { data: accounts } = await supabase.from("accounts").select("id, business_name, assigned_rep_id, status").in("status", ESTADOS);

// 3) qué cuentas tienen al menos un contacto
const ids = accounts.map((a) => a.id);
const withContact = new Set();
for (let i = 0; i < ids.length; i += 500) {
  const chunk = ids.slice(i, i + 500);
  const { data: contacts } = await supabase.from("contacts").select("account_id").in("account_id", chunk);
  for (const c of contacts ?? []) withContact.add(c.account_id);
}

mkdirSync("/tmp/datos-faltantes", { recursive: true });
const summary = [];
for (const r of reps) {
  const sinContacto = accounts
    .filter((a) => a.assigned_rep_id === r.id && !withContact.has(a.id))
    .map((a) => a.business_name)
    .sort((x, y) => String(x).localeCompare(String(y)));
  if (sinContacto.length === 0) continue; // saltado (igual que el cron)
  const status = r.email ? "ENVIARÍA" : "SIN EMAIL (saltado)";
  summary.push({ rep: r.full_name || r.id, email: r.email || "—", cuentas: sinContacto.length, status });
  if (r.email) {
    const slug = String(r.full_name || r.id).toLowerCase().replace(/[^a-z0-9]+/g, "-");
    writeFileSync(`/tmp/datos-faltantes/${slug}.html`, buildHtml(r.full_name || "", sinContacto));
  }
}

summary.sort((a, b) => b.cuentas - a.cuentas);
console.log("\n=== Vendedores que RECIBIRÍAN el correo (criterio sin_contactos) ===\n");
console.table(summary);
console.log(`\nTotal vendedores activos: ${reps.length}`);
console.log(`Recibirían correo: ${summary.filter((s) => s.status === "ENVIARÍA").length}`);
console.log(`Sin email (saltados): ${summary.filter((s) => s.status !== "ENVIARÍA").length}`);
console.log(`Cuentas sin contacto en total: ${summary.reduce((n, s) => n + s.cuentas, 0)}`);
console.log("HTML guardado en /tmp/datos-faltantes/");
