// Carga a cartera las facturas de CONTPAQi que el CRM no tiene.
//
//   node scripts/cargar-facturas-contpaq.mjs <facturas.xls> <cartera.xlsx>           → ANÁLISIS
//   node scripts/cargar-facturas-contpaq.mjs <facturas.xls> <cartera.xlsx> --apply   → APLICA
//
// Necesita DOS archivos porque ninguno basta solo:
//   1. facturas.xls  — reporte "Impresión de Documentos" (agrupado por cliente).
//      Es el universo de facturas emitidas, pero NO trae pagos.
//   2. cartera.xlsx  — listado plano de saldo neto (# Cliente / Folio / Total).
//      Es la foto de lo que sigue abierto HOY. Todo folio que NO aparece aquí
//      está liquidado.
//   total_paid = total − (saldo del folio en cartera.xlsx, o 0 si no aparece)
//
// FOOTGUN: nunca toca facturas que el CRM ya tiene. Reimportarlas encima
// resetea total_paid y tumba los pagos ya aplicados (ver memoria
// "reimporte-facturas-pisa-pagos").
//
// Las facturas liquidadas se insertan con total_paid = total y SIN registro en
// `payments`: no conocemos la fecha real del abono, e inventarla ensuciaría la
// eficiencia de cobro, el "último pago aplicado" y la conciliación bancaria.

import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "node:fs";
import * as XLSX from "xlsx";

const [FILE_FACT, FILE_CART] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const APPLY = process.argv.includes("--apply");
if (!FILE_FACT || !FILE_CART) {
  throw new Error("Uso: node scripts/cargar-facturas-contpaq.mjs <facturas.xls> <cartera.xlsx> [--apply]");
}

const MES = { ENE: 1, FEB: 2, MAR: 3, ABR: 4, MAY: 5, JUN: 6, JUL: 7, AGO: 8, SEP: 9, OCT: 10, NOV: 11, DIC: 12 };
const num = (v) => Number(String(v ?? "0").replace(/[$,\s]/g, "")) || 0;
const normCli = (v) => String(v ?? "").trim().replace(/\.0+$/, "").replace(/^0+/, "") || null;
const money = (n) => "$" + Number(n).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fecha = (s) => {
  const m = String(s).match(/^(\d{2})\/([A-Z]{3})\/(\d{4})$/);
  return m ? `${m[3]}-${String(MES[m[2]]).padStart(2, "0")}-${m[1]}` : null;
};
const addDays = (iso, d) => { const x = new Date(iso + "T00:00:00Z"); x.setUTCDate(x.getUTCDate() + d); return x.toISOString().slice(0, 10); };

// ── 1. Facturas emitidas ─────────────────────────────────────────────────────
// El reporte trae 2 filas por documento: encabezado + importes.
const rowsF = XLSX.utils.sheet_to_json(
  XLSX.read(readFileSync(FILE_FACT)).Sheets["Impresión de Documentos"], { header: 1, raw: false },
);
let cli = null, nom = null;
const docs = [];
for (let i = 0; i < rowsF.length; i++) {
  const r = rowsF[i] ?? [];
  if (String(r[0] ?? "").startsWith("Cliente:")) { cli = normCli(r[3]); continue; }
  if (String(r[0] ?? "").startsWith("Nombre:")) { nom = String(r[3] ?? "").trim(); continue; }
  const f = fecha(r[0]);
  if (!f) continue;
  const a = rowsF[i + 1] ?? [];
  docs.push({
    folio: String(r[1] ?? "").trim() + String(r[2] ?? "").replace(/,/g, "").trim(),
    fecha: f, estado: String(r[8] ?? "").trim(), cliente: cli, nombre: nom,
    neto: num(a[5]), descuento: num(a[6]), impuesto: num(a[7]), total: num(a[8]),
  });
}
const vivas = docs.filter((d) => d.estado === "Afectado");
console.log(`\n=== FACTURAS ===`);
console.log(`Documentos: ${docs.length} · Afectados: ${vivas.length} · descartados por estado: ${docs.length - vivas.length}`);

// ── 2. Saldo abierto de hoy ──────────────────────────────────────────────────
const rowsC = XLSX.utils.sheet_to_json(XLSX.read(readFileSync(FILE_CART)).Sheets["Cartera"], { defval: "" });
const saldo = new Map();
for (const r of rowsC) {
  const f = String(r["Folio"] ?? "").trim();
  if (f) saldo.set(f, (saldo.get(f) ?? 0) + num(r["Total"]));
}
console.log(`Folios con saldo abierto: ${saldo.size} · ${money([...saldo.values()].reduce((s, x) => s + x, 0))}`);

// ── 3. CRM ───────────────────────────────────────────────────────────────────
// .env.local trae la service role key repetida (una vigente y una rotada):
// probamos todas, de la última a la primera, como reconciliar-cartera-plana.mjs.
const env = readFileSync(".env.local", "utf8");
const all = (k) => [...env.matchAll(new RegExp(`^${k}=(.+)$`, "gm"))].map((m) => m[1].trim().split(/\s+#/)[0].trim());
let db = null;
for (const key of all("SUPABASE_SERVICE_ROLE_KEY").reverse()) {
  const c = createClient(all("NEXT_PUBLIC_SUPABASE_URL")[0], key, { auth: { persistSession: false } });
  const { error } = await c.from("accounts").select("id", { head: true, count: "exact" }).limit(1);
  if (!error) { db = c; break; }
}
if (!db) throw new Error("Sin credenciales válidas en .env.local");
const page = async (t, sel) => {
  const out = [];
  for (let f = 0; ; f += 1000) {
    const { data, error } = await db.from(t).select(sel).range(f, f + 999);
    if (error) throw error;
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out;
};
const accounts = await page("accounts", "id, client_number, business_name, credit_days");
const yaEnCrm = new Set((await page("invoices", "invoice_number")).map((i) => i.invoice_number));
const muestras = new Set(
  (await page("sales_reps", "sample_client_number")).map((r) => normCli(r.sample_client_number)).filter(Boolean),
);

// Un client_number con dos cuentas es ambiguo: no adivinamos a cuál va la factura.
const porCli = new Map();
for (const a of accounts) {
  const cn = normCli(a.client_number);
  if (!cn) continue;
  if (!porCli.has(cn)) porCli.set(cn, []);
  porCli.get(cn).push(a);
}

// ── 4. Plan ──────────────────────────────────────────────────────────────────
const insertar = [], omitidas = { existente: 0, muestra: [], sinCuenta: new Map(), ambigua: new Map() };
for (const d of vivas) {
  if (yaEnCrm.has(d.folio)) { omitidas.existente++; continue; }
  if (muestras.has(d.cliente)) { omitidas.muestra.push(d); continue; }
  const cand = porCli.get(d.cliente) ?? [];
  const key = `#${d.cliente} ${d.nombre}`;
  if (cand.length === 0) {
    const e = omitidas.sinCuenta.get(key) ?? { n: 0, monto: 0 };
    omitidas.sinCuenta.set(key, { n: e.n + 1, monto: e.monto + d.total });
    continue;
  }
  if (cand.length > 1) {
    const e = omitidas.ambigua.get(key) ?? { n: 0, monto: 0, opciones: cand.map((c) => c.business_name) };
    omitidas.ambigua.set(key, { ...e, n: e.n + 1, monto: e.monto + d.total });
    continue;
  }
  const acc = cand[0];
  const abierto = saldo.get(d.folio) ?? 0;
  const dias = acc.credit_days ?? 30;
  insertar.push({
    invoice_number: d.folio,
    account_id: acc.id,
    invoice_date: d.fecha,
    due_date: addDays(d.fecha, dias),
    payment_terms_days: dias,
    subtotal: Math.round((d.neto - d.descuento) * 100) / 100,
    iva: d.impuesto,
    total: d.total,
    total_paid: Math.round((d.total - abierto) * 100) / 100,
    status: abierto <= 0.005 ? "pagada" : abierto >= d.total - 0.005 ? "pendiente" : "pagada_parcial",
    notes: `Carga histórica CONTPAQi ${new Date().toISOString().slice(0, 10)}${abierto <= 0.005 ? " — liquidada, sin detalle de abono" : ""}`,
  });
}

const suma = (a, g) => a.reduce((s, x) => s + g(x), 0);
const liquidadas = insertar.filter((i) => i.status === "pagada");
const conSaldo = insertar.filter((i) => i.status !== "pagada");
console.log(`\n=== PLAN ===`);
console.log(`INSERTAR: ${insertar.length} facturas · ${money(suma(insertar, (i) => i.total))}`);
console.log(`   ya liquidadas (saldo $0):   ${liquidadas.length} · ${money(suma(liquidadas, (i) => i.total))}`);
console.log(`   con saldo abierto:          ${conSaldo.length} · ${money(suma(conSaldo, (i) => i.total - i.total_paid))}`);
console.log(`\nSALDO NUEVO QUE SE AGREGA A CARTERA: ${money(suma(insertar, (i) => i.total - i.total_paid))}`);
const porMes = {};
for (const i of insertar) { const m = i.invoice_date.slice(0, 7); porMes[m] = (porMes[m] ?? 0) + 1; }
console.log(`Por mes: ${Object.entries(porMes).sort().map(([m, n]) => `${m}:${n}`).join(" · ")}`);

console.log(`\n=== OMITIDAS ===`);
console.log(`Ya están en el CRM (no se tocan):  ${omitidas.existente}`);
console.log(`Clientes de muestras:              ${omitidas.muestra.length}`);
console.log(`Sin cuenta en el CRM:              ${suma([...omitidas.sinCuenta.values()], (v) => v.n)}`);
for (const [k, v] of omitidas.sinCuenta) console.log(`   ${k} · ${v.n} fact · ${money(v.monto)}`);
console.log(`Client_number ambiguo (2 cuentas): ${suma([...omitidas.ambigua.values()], (v) => v.n)}`);
for (const [k, v] of omitidas.ambigua) console.log(`   ${k} · ${v.n} fact · ${money(v.monto)} → ${v.opciones.join(" | ")}`);

if (!APPLY) {
  console.log(`\n*** MODO ANÁLISIS — no se escribió nada. Corre con --apply para aplicar. ***\n`);
  process.exit(0);
}

// ── 5. Aplicar ───────────────────────────────────────────────────────────────
const snap = `/tmp/carga-facturas-${new Date().toISOString().slice(0, 10)}.json`;
writeFileSync(snap, JSON.stringify({ archivo: FILE_FACT, folios: insertar.map((i) => i.invoice_number) }));
console.log(`\n*** APLICANDO — respaldo para revertir en ${snap} ***`);
let ok = 0;
for (let i = 0; i < insertar.length; i += 200) {
  const lote = insertar.slice(i, i + 200);
  const { error } = await db.from("invoices").insert(lote);
  if (error) { console.error(`   lote ${i}: ${error.message}`); break; }
  ok += lote.length;
  console.log(`   ${ok}/${insertar.length}`);
}
console.log(`\nInsertadas: ${ok}`);
console.log(`Revertir: delete from invoices where invoice_number in (…los folios del respaldo…);`);
