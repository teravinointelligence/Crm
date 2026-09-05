// Importa ventas mensuales desde el reporte "Documentos Detallados" de CONTPAQi.
// Equivalente al botón "Confirmar import" en /ventas/importar, pero desde terminal.
//
//   node scripts/import-ventas-contpaq.mjs <ruta-al-archivo.xls> [YYYY-MM]
//
// Ejemplo:
//   node scripts/import-ventas-contpaq.mjs ~/Downloads/"facruracion 1 al 29 junio.xls" 2026-06
//
// Si no pasas el mes, se autodetecta del archivo.

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import * as XLSX from "xlsx";

// ─── Credenciales ──────────────────────────────────────────────────────────────
const env = readFileSync(".env.local", "utf8");
const all = (key) =>
  [...env.matchAll(new RegExp(`^${key}=(.+)$`, "gm"))].map((m) => m[1].trim().split(/\s+#/)[0].trim());
const url = all("NEXT_PUBLIC_SUPABASE_URL")[0];
const candidates = all("SUPABASE_SERVICE_ROLE_KEY").reverse();
if (!url || !candidates.length) throw new Error("Faltan credenciales en .env.local");

let db = null;
for (const key of candidates) {
  const c = createClient(url, key, { auth: { persistSession: false } });
  const { error } = await c.from("accounts").select("id", { head: true, count: "exact" }).limit(1);
  if (!error) { db = c; break; }
}
if (!db) throw new Error("Ninguna SUPABASE_SERVICE_ROLE_KEY autenticó");

// ─── Args ──────────────────────────────────────────────────────────────────────
const filePath = process.argv[2];
if (!filePath) {
  console.error("Uso: node scripts/import-ventas-contpaq.mjs <archivo.xls> [YYYY-MM]");
  process.exit(1);
}
const argPeriod = process.argv[3]; // opcional, ej. "2026-06"

// ─── Helpers ───────────────────────────────────────────────────────────────────
const ESP_MONTHS = {
  ene:1,feb:2,mar:3,abr:4,may:5,jun:6,jul:7,ago:8,sep:9,oct:10,nov:11,dic:12,
};
function norm(s) {
  return String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
}
function parseNum(v) {
  if (typeof v === "number") return v;
  const n = Number(String(v ?? "").replace(/[$,\s]/g, ""));
  return Number.isNaN(n) ? 0 : n;
}
function normalizeClientNumber(v) {
  const s = String(v ?? "").trim();
  if (!s || s === "0") return null;
  const n = parseInt(s, 10);
  return Number.isNaN(n) ? null : String(n);
}
function firstNonEmpty(row, start) {
  for (let k = start; k < row.length; k++) {
    const v = String(row[k] ?? "").trim();
    if (v) return v;
  }
  return "";
}
function ymdFromEsp(dd, mmm, yyyy) {
  const mo = ESP_MONTHS[mmm.toLowerCase().slice(0, 3)];
  return mo ? `${yyyy}-${String(mo).padStart(2, "0")}-01` : null;
}

const DEFAULT_COLS = { codigo:0, nombre:1, cantidad:2, neto:4, descuento:5, netoDesc:6, impuesto:7, total:8 };

function mapItemCols(headerRow) {
  const h = headerRow.map((c) => norm(c));
  const find = (...cands) => h.findIndex((x) => cands.some((c) => x === c || x.includes(c)));
  const codigo = find("codigo");
  const total = find("total");
  if (codigo === -1 || total === -1) return DEFAULT_COLS;
  const netoDesc = h.findIndex((x) => x.includes("neto-desc") || x.includes("neto desc") || x.includes("netodesc"));
  return {
    codigo,
    nombre: find("nombre"),
    cantidad: find("cantidad"),
    neto: h.findIndex((x) => x === "neto"),
    descuento: find("descuento"),
    netoDesc,
    impuesto: find("impuesto"),
    total,
  };
}

function detectPeriod(matrix) {
  const text = matrix.slice(0, 8).flat().map((c) => String(c ?? "")).join(" ");
  const marcado = /(?:del|per[ií]odo)[:\s]+(\d{1,2})[/-]([a-zA-Z]{3,4})[/-](\d{4})/i.exec(text);
  if (marcado) { const r = ymdFromEsp(marcado[1], marcado[2], marcado[3]); if (r) return r; }
  const mesNombre = {enero:1,febrero:2,marzo:3,abril:4,mayo:5,junio:6,julio:7,agosto:8,septiembre:9,octubre:10,noviembre:11,diciembre:12};
  const nm = /(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\s+(?:de\s+)?(\d{4})/i.exec(text);
  if (nm) { const mo = mesNombre[nm[1].toLowerCase()]; if (mo) return `${nm[2]}-${String(mo).padStart(2, "0")}-01`; }
  const esp = /(\d{1,2})[/-]([a-zA-Z]{3,4})[/-](\d{4})/.exec(text);
  if (esp) { const r = ymdFromEsp(esp[1], esp[2], esp[3]); if (r) return r; }
  return null;
}

// ─── Parse ─────────────────────────────────────────────────────────────────────
console.log(`\nLeyendo archivo: ${filePath}`);
const buf = readFileSync(filePath);
const wb = XLSX.read(buf, { type: "buffer", cellDates: true });
const sheet = wb.Sheets[wb.SheetNames[0]];
const m = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", blankrows: true });

const periodGuess = detectPeriod(m);
const periodArg = argPeriod ? `${argPeriod}-01` : null;
const periodDate = periodArg ?? periodGuess;
if (!periodDate) {
  console.error("No se pudo detectar el periodo. Pásalo como argumento: node ... 2026-06");
  process.exit(1);
}
console.log(`Periodo detectado: ${periodDate.slice(0, 7)}`);

const clientes = [];
let cur = null;
let cols = DEFAULT_COLS;
let pendingMeta = false;
let skipInvoice = false;
const DATE_RE = /^\d{1,2}[/-][a-zA-Z]{3,4}[/-]\d{4}$/;

const pushCur = () => {
  if (cur && cur.items.length) {
    cur.venta_bruta = Math.round(cur.items.reduce((s, it) => s + it.total, 0) * 100) / 100;
    cur.neto        = Math.round(cur.items.reduce((s, it) => s + it.neto,  0) * 100) / 100;
    cur.descuento   = Math.round(cur.items.reduce((s, it) => s + it.descuento, 0) * 100) / 100;
    cur.neto_desc   = Math.round(cur.items.reduce((s, it) => s + it.neto_desc, 0) * 100) / 100;
    clientes.push(cur);
  }
  cur = null;
};

for (let i = 0; i < m.length; i++) {
  const r = m[i] ?? [];
  const c0 = String(r[0] ?? "").trim();
  const c1 = String(r[1] ?? "").trim();
  const c0n = norm(c0);

  if (c0n === "cliente:") {
    pushCur();
    cur = { client_number: normalizeClientNumber(firstNonEmpty(r, 1)), client_name: null, items: [], venta_bruta:0, neto:0, descuento:0, neto_desc:0 };
    skipInvoice = false;
    continue;
  }
  if (c0n === "nombre:") { if (cur) cur.client_name = firstNonEmpty(r, 1) || null; continue; }
  if (c0n === "fecha" && norm(c1) === "serie") { pendingMeta = true; continue; }
  if (pendingMeta) {
    pendingMeta = false;
    const estado = norm(String(r[8] ?? firstNonEmpty(r, 8)));
    skipInvoice = estado.startsWith("cancel");
    continue;
  }
  if (c0n === "codigo") { cols = mapItemCols(r); continue; }
  if (c1 === "Total Cliente" || c1 === "Total General" || c0.includes("====")) continue;
  if (!c0 || c0n === "contpaq i" || c0n.startsWith("moneda") || DATE_RE.test(c0)) continue;

  if (!cur || skipInvoice) continue;
  const codigo = String(r[cols.codigo] ?? "").trim();
  const nombre = String(r[cols.nombre] ?? "").trim();
  if (!codigo || !nombre) continue;
  const cantidad  = parseNum(r[cols.cantidad]);
  const neto      = parseNum(r[cols.neto]);
  const descuento = parseNum(r[cols.descuento]);
  const neto_desc = cols.netoDesc >= 0 ? parseNum(r[cols.netoDesc]) : Math.round((neto - descuento) * 100) / 100;
  const impuesto  = parseNum(r[cols.impuesto]);
  const total     = parseNum(r[cols.total]);
  if (total === 0 && cantidad === 0) continue;
  cur.items.push({ codigo: codigo || null, producto_nombre: nombre, cantidad, neto, descuento, neto_desc, impuesto, total });
}
pushCur();

console.log(`\nClientes parseados del XLS: ${clientes.length}`);
const totalLineas = clientes.reduce((s, c) => s + c.items.length, 0);
console.log(`Líneas de producto: ${totalLineas}`);

// ─── Total General del reporte (para cuadrar) ────────────────────────────────
let totalGeneral = null;
for (const r of m) {
  if (String(r[1] ?? "").trim() === "Total General") {
    totalGeneral = {
      cantidad: parseNum(r[cols.cantidad]), neto: parseNum(r[cols.neto]), descuento: parseNum(r[cols.descuento]),
      neto_desc: cols.netoDesc >= 0 ? parseNum(r[cols.netoDesc]) : 0, impuesto: parseNum(r[cols.impuesto]), total: parseNum(r[cols.total]),
    };
  }
}
if (!totalGeneral) {
  const r2 = (n) => Math.round(n * 100) / 100;
  totalGeneral = { cantidad: 0, neto: 0, descuento: 0, neto_desc: 0, impuesto: 0, total: 0 };
  for (const c of clientes) for (const it of c.items) {
    totalGeneral.cantidad += it.cantidad; totalGeneral.neto += it.neto; totalGeneral.descuento += it.descuento;
    totalGeneral.neto_desc += it.neto_desc; totalGeneral.impuesto += it.impuesto; totalGeneral.total += it.total;
  }
  for (const k of Object.keys(totalGeneral)) totalGeneral[k] = r2(totalGeneral[k]);
  console.warn("⚠ El archivo no trae 'Total General'; se cuadra contra la suma leída.");
}

// ─── Import atómico via RPC (nunca descarta clientes en silencio) ─────────────
// Crea cuentas faltantes (needs_review), importa sin vendedor las que no lo
// tienen, retira filas del mes que ya no vienen y cuadra vs Total General.
console.log("\nImportando via import_monthly_sales_contpaq...");
const { data: summary, error: rpcErr } = await db.rpc("import_monthly_sales_contpaq", {
  p_period: periodDate,
  p_clientes: clientes,
  p_source_file_name: filePath.split("/").pop(),
  p_source_format: "contpaq",
  p_report_totals: totalGeneral,
  p_parse_errors: 0,
  p_replace_period: true,
});
if (rpcErr) {
  console.error("Error al importar ventas:", rpcErr.message);
  process.exit(1);
}

const fmt = (n) => `$${Number(n ?? 0).toLocaleString("es-MX", { minimumFractionDigits: 2 })}`;
console.log(`
✓ Importación completa
  Periodo   : ${periodDate.slice(0, 7)}
  Clientes  : ${summary.customers}
  Productos : ${summary.product_lines} líneas
  Reporte   : ${fmt(summary.report_totals?.total)}   Importado: ${fmt(summary.imported_totals?.total)}   Dif: ${fmt(summary.total_diff)}
`);
if (summary.diff_alert) console.error("✗ NO CUADRA: revisa los avisos antes de usar este mes.");
for (const a of summary.created) console.warn(`  · # ${a.client_number} (${a.client_name}): cuenta creada${a.muestras ? " como MUESTRAS" : ""} — asignar vendedor.`);
for (const a of summary.without_rep) if (!summary.created.some((c) => c.account_id === a.account_id)) console.warn(`  · # ${a.client_number} (${a.client_name}): cuenta sin vendedor — importada sin vendedor.`);
for (const a of summary.duplicates) console.warn(`  · # ${a.client_number} (${a.client_name}): ${a.n} cuentas con ese # en el CRM — corregir duplicado.`);
for (const a of summary.removed) console.warn(`  · # ${a.client_number} (${a.client_name}): ya no viene en el reporte — fila retirada (${fmt(a.venta_bruta)}).`);
for (const k of summary.skipped) console.warn(`  · # ${k.client_number ?? "?"} (${k.client_name ?? "?"}): NO importado — ${k.reason}.`);
console.log("Las comisiones se actualizan automáticamente en /ventas y /reportes.");
