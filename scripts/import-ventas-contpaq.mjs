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

// ─── Resuelve cuentas en CRM ───────────────────────────────────────────────────
console.log("\nCargando cuentas del CRM...");
const { data: accounts } = await db.from("accounts").select("id, client_number, business_name, assigned_rep_id").range(0, 49999);
const byClientNum = new Map();
for (const a of accounts ?? []) {
  const cn = normalizeClientNumber(a.client_number);
  if (cn) byClientNum.set(cn, { id: a.id, assigned_rep_id: a.assigned_rep_id, name: a.business_name });
}

const matched = [];
const errs = [];
for (const c of clientes) {
  const acc = c.client_number ? byClientNum.get(c.client_number) : undefined;
  if (!acc) { errs.push(`# ${c.client_number ?? "?"} (${c.client_name ?? "?"}): cliente no existe en CRM`); continue; }
  if (!acc.assigned_rep_id) { errs.push(`# ${c.client_number} (${c.client_name}): cuenta sin vendedor asignado`); continue; }
  matched.push({ acc, c });
}

console.log(`Clientes resueltos: ${matched.length}  /  Sin resolver: ${errs.length}`);
if (errs.length) {
  console.warn("\nAvisos (clientes no importados):");
  errs.forEach((e) => console.warn("  ·", e));
}
if (!matched.length) { console.error("\nNingún cliente resolvió. Abortando."); process.exit(1); }

// ─── Upsert monthly_sales ──────────────────────────────────────────────────────
console.log("\nImportando cabeceras monthly_sales...");
const salesPayload = matched.map(({ acc, c }) => ({
  account_id: acc.id, sales_rep_id: acc.assigned_rep_id, period: periodDate,
  client_number: c.client_number, client_name: c.client_name, vendedor_excel: null,
  venta_bruta: c.venta_bruta, neto: c.neto, descuento: c.descuento, neto_desc: c.neto_desc,
}));

const { data: upserted, error: upErr } = await db
  .from("monthly_sales")
  .upsert(salesPayload, { onConflict: "account_id,period" })
  .select("id, account_id");
if (upErr || !upserted) {
  console.error("Error al importar ventas:", upErr?.message);
  process.exit(1);
}
console.log(`  → ${upserted.length} registros upserted`);

const saleIdByAccount = new Map(upserted.map((r) => [r.account_id, r.id]));
const saleIds = upserted.map((r) => r.id);

// ─── Replace items (atómico via RPC) ──────────────────────────────────────────
console.log("Reemplazando líneas de producto (replace_sales_items)...");
const itemsPayload = [];
for (const { acc, c } of matched) {
  const saleId = saleIdByAccount.get(acc.id);
  if (!saleId) continue;
  for (const it of c.items) {
    itemsPayload.push({
      monthly_sale_id: saleId, codigo: it.codigo, producto_nombre: it.producto_nombre,
      cantidad: it.cantidad, neto: it.neto, descuento: it.descuento,
      neto_desc: it.neto_desc, impuesto: it.impuesto, total: it.total,
    });
  }
}

const { error: itErr } = await db.rpc("replace_sales_items", {
  p_sale_ids: saleIds,
  p_items: itemsPayload,
});
if (itErr) {
  console.error("Error al guardar líneas de producto:", itErr.message);
  process.exit(1);
}
console.log(`  → ${itemsPayload.length} líneas de producto guardadas`);

// ─── Resumen ───────────────────────────────────────────────────────────────────
const totalVenta = matched.reduce((s, { c }) => s + c.venta_bruta, 0);
console.log(`
✓ Importación completa
  Periodo  : ${periodDate.slice(0, 7)}
  Clientes : ${matched.length}
  Productos: ${itemsPayload.length} líneas
  Venta bruta total: $${totalVenta.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
${errs.length ? `  ⚠ ${errs.length} cliente(s) no importados (ver arriba)\n` : ""}Las comisiones se actualizan automáticamente en /ventas y /reportes.
`);
