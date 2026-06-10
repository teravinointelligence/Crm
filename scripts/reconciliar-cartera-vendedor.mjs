// Conciliación de cartera ACOTADA a los clientes que aparecen en un archivo por
// vendedor (hoja "Detalle" con # Cliente, Serie, Folio, Saldo). Solo toca las
// cuentas presentes en el archivo — ningún otro cliente se ve afectado.
//
//   node scripts/reconciliar-cartera-vendedor.mjs "<archivo.xlsx>"           → ANÁLISIS
//   node scripts/reconciliar-cartera-vendedor.mjs "<archivo.xlsx>" --apply   → APLICA
//
// Regla por cada cuenta del archivo: folio en el Detalle = sigue abierto (con
// ese saldo; si es menor, abono parcial); folio que ya no aparece = pagado.

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import * as XLSX from "xlsx";

const FILE = process.argv[2];
const APPLY = process.argv.includes("--apply");
const SHEET = "Detalle";
if (!FILE) throw new Error("Uso: node scripts/reconciliar-cartera-vendedor.mjs <archivo.xlsx> [--apply]");

const nc = (v) => { const s = String(v ?? "").trim().replace(/\.0+$/, ""); if (!s) return null; return s.replace(/^0+/, "") || "0"; };

// ---- parse hoja Detalle ----
const wb = XLSX.read(readFileSync(FILE), { type: "buffer" });
const ws = wb.Sheets[SHEET];
if (!ws) throw new Error(`No encontré la hoja "${SHEET}". Hojas: ${wb.SheetNames.join(", ")}`);
const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: true, blankrows: false });

const fileOpen = new Map();   // invoice_number -> { saldo, cn, nom }
const scope = new Map();      // clientNum -> nombre
for (const r of aoa) {
  const cn = nc(r[0]);
  const serie = String(r[3] ?? "").trim();
  const folio = String(r[4] ?? "").trim().replace(/\.0+$/, "");
  const saldo = typeof r[7] === "number" ? r[7] : Number(String(r[7] ?? "").replace(/[$,\s]/g, ""));
  if (!cn || !folio || !Number.isFinite(saldo) || saldo <= 0) continue; // salta título/encabezado/total
  const inv = serie ? `${serie}${folio}` : folio;
  const prev = fileOpen.get(inv);
  fileOpen.set(inv, { saldo: Math.round(((prev?.saldo || 0) + saldo) * 100) / 100, cn, nom: String(r[1] ?? "").trim() });
  scope.set(cn, String(r[1] ?? "").trim());
}
const fileTotal = [...fileOpen.values()].reduce((s, x) => s + x.saldo, 0);
console.log(`\n=== ARCHIVO (hoja ${SHEET}) ===`);
console.log(`Clientes (scope): ${scope.size} · Facturas abiertas: ${fileOpen.size} · Saldo: $${fileTotal.toLocaleString("es-MX",{minimumFractionDigits:2})}`);

// ---- CRM ----
const env = readFileSync(".env.local", "utf8");
const all = (k) => [...env.matchAll(new RegExp(`^${k}=(.+)$`, "gm"))].map((m) => m[1].trim().split(/\s+#/)[0].trim());
const url = all("NEXT_PUBLIC_SUPABASE_URL")[0];
let db = null;
for (const key of all("SUPABASE_SERVICE_ROLE_KEY").reverse()) {
  const c = createClient(url, key, { auth: { persistSession: false } });
  const { error } = await c.from("accounts").select("id", { head: true, count: "exact" }).limit(1);
  if (!error) { db = c; break; }
}
if (!db) throw new Error("Sin credenciales válidas en .env.local");

const cns = [...scope.keys()];
const { data: accts } = await db.from("accounts").select("id, client_number, business_name, assigned_rep_id").in("client_number", cns);
const { data: reps } = await db.from("sales_reps").select("id, full_name");
const repName = new Map((reps ?? []).map((r) => [r.id, r.full_name]));
const acctIds = (accts ?? []).map((a) => a.id);
const acctById = new Map((accts ?? []).map((a) => [a.id, a]));

// facturas abiertas SOLO de las cuentas del archivo
const crmOpen = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await db.from("invoices")
    .select("id, invoice_number, account_id, balance, due_date, invoice_date")
    .in("account_id", acctIds).neq("status", "cancelada").gt("balance", 0).range(from, from + 999);
  if (error) throw error;
  crmOpen.push(...data);
  if (data.length < 1000) break;
}
const crmTotal = crmOpen.reduce((s, i) => s + Number(i.balance || 0), 0);

// ---- plan ----
const EPS = 0.05;
const full = [], partial = [], keep = [], over = [];
for (const inv of crmOpen) {
  const f = fileOpen.get(inv.invoice_number);
  const bal = Number(inv.balance || 0);
  if (!f) { full.push(inv); continue; }
  const diff = Math.round((bal - f.saldo) * 100) / 100;
  if (diff > EPS) partial.push({ inv, pay: diff }); else if (diff < -EPS) over.push({ inv, fileSaldo: f.saldo, bal }); else keep.push(inv);
}
const crmFolios = new Set(crmOpen.map((i) => i.invoice_number));
const notInCrm = [...fileOpen.entries()].filter(([inv]) => !crmFolios.has(inv));
const sum = (a, f) => a.reduce((s, x) => s + f(x), 0);
const fullT = sum(full, (i) => Number(i.balance || 0)), partT = sum(partial, (x) => x.pay), keepT = sum(keep, (i) => Number(i.balance || 0));

console.log(`\n=== CRM (cuentas del archivo) ===`);
console.log(`Cuentas encontradas: ${acctIds.length} de ${scope.size} · Facturas abiertas: ${crmOpen.length} · Saldo: $${crmTotal.toLocaleString("es-MX",{minimumFractionDigits:2})}`);

// chequeo de vendedor: ¿todas asignadas a Andra?
const repCount = new Map();
for (const a of accts ?? []) { const n = repName.get(a.assigned_rep_id) ?? "(sin vendedor)"; repCount.set(n, (repCount.get(n) || 0) + 1); }
console.log(`Vendedor de las cuentas:`, [...repCount.entries()].map(([n, c]) => `${n}: ${c}`).join(" · "));

console.log(`\n=== PLAN (solo estas cuentas) ===`);
console.log(`Quedan ABIERTAS (mismo saldo):       ${keep.length} · $${keepT.toLocaleString("es-MX",{minimumFractionDigits:2})}`);
console.log(`PAGO PARCIAL (saldo menor):          ${partial.length} · abono $${partT.toLocaleString("es-MX",{minimumFractionDigits:2})}`);
console.log(`MARCAR PAGADAS (folio no en archivo): ${full.length} · $${fullT.toLocaleString("es-MX",{minimumFractionDigits:2})}`);
console.log(`Saldo proyectado de estas cuentas: $${(crmTotal-fullT-partT).toLocaleString("es-MX",{minimumFractionDigits:2})} (debe ≈ archivo $${fileTotal.toLocaleString("es-MX",{minimumFractionDigits:2})})`);
console.log(`\n=== REVISAR ===`);
console.log(`Clientes del archivo SIN cuenta en el CRM: ${cns.filter((c)=>!(accts??[]).some((a)=>nc(a.client_number)===c)).join(", ") || "ninguno"}`);
console.log(`Folios del archivo que el CRM no tiene abiertos: ${notInCrm.length}${notInCrm.length?` (${notInCrm.slice(0,8).map(([inv])=>inv).join(", ")}${notInCrm.length>8?"…":""})`:""}`);
console.log(`Folios donde el archivo dice MÁS saldo que el CRM: ${over.length}`);

if (!APPLY) { console.log(`\n*** MODO ANÁLISIS — no se escribió nada. Corre con --apply para aplicar. ***\n`); process.exit(0); }

console.log(`\n*** APLICANDO ***`);
let ok = 0, err = 0;
const NOTE = "Conciliación cartera ANDRA 09/jun/2026 — saldo liquidado";
const applyOne = async (acc, amount, date, note, invId) => {
  const { error } = await db.rpc("apply_payment", { p_account_id: acc, p_amount: amount, p_payment_date: date, p_method: "otro", p_reference: null, p_notes: note, p_invoice_id: invId });
  if (error) { err++; if (err <= 10) console.log("  ERR", invId, error.message); } else ok++;
};
for (const i of full) await applyOne(i.account_id, Number(i.balance), i.due_date || i.invoice_date, NOTE, i.id);
for (const x of partial) await applyOne(x.inv.account_id, x.pay, x.inv.due_date || x.inv.invoice_date, NOTE + " (parcial)", x.inv.id);
console.log(`\nListo. Pagos aplicados: ${ok} · errores: ${err}`);
