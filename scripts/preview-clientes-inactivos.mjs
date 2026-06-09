// Reproduce EXACTAMENTE lo que el cron /api/cron/clientes-inactivos habría
// enviado (umbral: 15 días sin actividad, incluye cuentas sin actividad alguna).
// Usa el service-role local. NO envía nada: solo imprime el resumen y guarda el
// HTML de cada vendedor en /tmp/clientes-inactivos/.
//
// Uso: node scripts/preview-clientes-inactivos.mjs [días]   (default 15)
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

const DAYS = Math.max(1, Math.round(Number(process.argv[2]) || 15));
const ESTADOS = ["activo", "prospecto"];
const MS_DAY = 86_400_000;
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const lastContactLabel = (days, iso) => {
  if (days === null) return "Sin actividad registrada";
  const fecha = iso ? new Date(iso).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" }) : "";
  const dias = days === 1 ? "1 día" : `${days} días`;
  return fecha ? `Hace ${dias} (${fecha})` : `Hace ${dias}`;
};

function buildHtml(repName, accounts) {
  const rows = accounts.map((a) => `
        <tr>
          <td style="padding:6px 10px;border-bottom:1px solid #eee;font-weight:600;">${escapeHtml(a.business_name)}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #eee;color:#b45309;">${escapeHtml(lastContactLabel(a.days_inactive, a.last_activity_date))}</td>
        </tr>`).join("");
  return `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:680px;margin:0 auto;color:#222;">
    <h2 style="color:#7a1220;margin:0 0 4px;">TERAVINO — Clientes sin seguimiento</h2>
    <p style="margin:0 0 16px;color:#666;">Hola ${escapeHtml(repName)}, estos clientes que tienes asignados llevan ${DAYS} días o más sin ninguna actividad registrada:</p>
    <table style="border-collapse:collapse;width:100%;font-size:14px;margin:12px 0;">
      <thead><tr style="background:#f6f1ee;text-align:left;"><th style="padding:6px 10px;">Cliente</th><th style="padding:6px 10px;">Último contacto</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p style="margin-top:16px;">Por favor dales seguimiento: agenda una visita, llamada o degustación y registra la actividad en el CRM. Mantener el contacto vivo evita que el cliente se enfríe.</p>
    <p style="color:#666;font-size:13px;margin-top:24px;">TERAVINO · CRM</p>
  </div>`;
}

// 1) vendedores activos
const { data: reps } = await supabase.from("sales_reps").select("id, full_name, email, active").eq("active", true);

// 2) cuentas activas/prospecto con su última actividad (vista 0015)
const { data: rows } = await supabase
  .from("v_account_last_activity")
  .select("account_id, business_name, assigned_rep_id, status, last_activity_date")
  .in("status", ESTADOS);

const now = Date.now();
const accounts = (rows ?? []).map((r) => ({
  ...r,
  days_inactive: r.last_activity_date === null ? null : Math.floor((now - new Date(r.last_activity_date).getTime()) / MS_DAY),
}));

const sortInactive = (a, b) => {
  const av = a.days_inactive ?? Infinity;
  const bv = b.days_inactive ?? Infinity;
  if (av !== bv) return bv - av;
  return String(a.business_name).localeCompare(String(b.business_name));
};

mkdirSync("/tmp/clientes-inactivos", { recursive: true });
const summary = [];
for (const r of reps) {
  const inactivas = accounts
    .filter((a) => a.assigned_rep_id === r.id && (a.days_inactive === null || a.days_inactive >= DAYS))
    .sort(sortInactive);
  if (inactivas.length === 0) continue; // saltado (igual que el cron)
  const status = r.email ? "ENVIARÍA" : "SIN EMAIL (saltado)";
  summary.push({ rep: r.full_name || r.id, email: r.email || "—", clientes: inactivas.length, status });
  if (r.email) {
    const slug = String(r.full_name || r.id).toLowerCase().replace(/[^a-z0-9]+/g, "-");
    writeFileSync(`/tmp/clientes-inactivos/${slug}.html`, buildHtml(r.full_name || "", inactivas));
  }
}

summary.sort((a, b) => b.clientes - a.clientes);
console.log(`\n=== Vendedores que RECIBIRÍAN el recordatorio (umbral: ${DAYS} días sin actividad) ===\n`);
console.table(summary);
console.log(`\nTotal vendedores activos: ${reps.length}`);
console.log(`Recibirían correo: ${summary.filter((s) => s.status === "ENVIARÍA").length}`);
console.log(`Sin email (saltados): ${summary.filter((s) => s.status !== "ENVIARÍA").length}`);
console.log(`Clientes inactivos en total: ${summary.reduce((n, s) => n + s.clientes, 0)}`);
console.log("HTML guardado en /tmp/clientes-inactivos/");
