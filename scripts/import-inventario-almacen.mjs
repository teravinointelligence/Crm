// Carga las existencias por almacén desde los reportes CONTPAQ
// "Inventario actual del almacén por producto" (uno por bodega).
// Replica la lógica de components/products/ImportExcelClient.tsx:
//   - código del Excel se resuelve por products.sku O products.codigo_contpaqi
//   - upsert en product_warehouse_stock (onConflict product_id,warehouse)
//   - el trigger trg_warehouse_stock_rollup recalcula products.stock_quantity
// Dry-run por defecto; --apply para escribir.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import * as XLSX from "xlsx";

const APPLY = process.argv.includes("--apply");
const DIR = "/Users/sabrina/Inventarios Teravino";
const FILES = [
  { file: "inventario v612 24 jul.xls", warehouse: "V612" },
  { file: "inventario la paz 24 jul.xls", warehouse: "La Paz" },
  { file: "inventario tijuana 24 jul.xls", warehouse: "Tijuana" },
  { file: "inventario vallarta 24 jul.xls", warehouse: "Vallarta" },
  { file: "inventario los cabos 24 jul.xls", warehouse: "Los Cabos" },
];

const norm = (k) =>
  String(k ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[._-]/g, " ").replace(/\s+/g, " ").trim();

function parse(path) {
  const wb = XLSX.read(readFileSync(path), { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const m = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true, blankrows: false });
  // header = primera fila con "codigo…" y "existencia"
  let hi = -1, sc = -1, kc = -1;
  for (let i = 0; i < m.length; i++) {
    const cells = m[i].map(norm);
    const s = cells.findIndex((c) => c === "codigo producto" || c === "codigo" || c === "sku" || c === "clave");
    const k = cells.findIndex((c) => c === "existencia");
    if (s !== -1 && k !== -1) { hi = i; sc = s; kc = k; break; }
  }
  if (hi === -1) throw new Error(`Sin encabezado en ${path}`);
  const rows = [];
  for (let i = hi + 1; i < m.length; i++) {
    const code = String(m[i][sc] ?? "").trim().replace(/\.0$/, "");
    if (!code || code.includes(":")) continue;
    const raw = m[i][kc];
    if (raw === null || String(raw).trim() === "") continue; // existencia vacía → no-producto
    const n = typeof raw === "number" ? raw : Number(String(raw).replace(/[,$\s]/g, ""));
    if (!Number.isFinite(n) || n < 0) continue;
    rows.push({ code, stock: n });
  }
  return rows;
}

const env = readFileSync(".env.local", "utf8");
const all = (k) => [...env.matchAll(new RegExp(`^${k}=(.+)$`, "gm"))].map((x) => x[1].trim().split(/\s+#/)[0].trim());
const url = all("NEXT_PUBLIC_SUPABASE_URL")[0];
let db = null;
for (const key of all("SUPABASE_SERVICE_ROLE_KEY").reverse()) {
  const c = createClient(url, key, { auth: { persistSession: false } });
  const { error } = await c.from("products").select("id", { head: true, count: "exact" }).limit(1);
  if (!error) { db = c; break; }
}
if (!db) throw new Error("sin credenciales");

// Mapa código → product_id (por sku y por codigo_contpaqi)
const skuToId = new Map(), contpaqToId = new Map();
{
  let from = 0;
  for (;;) {
    const { data, error } = await db.from("products").select("id, sku, codigo_contpaqi").range(from, from + 999);
    if (error) throw new Error(error.message);
    for (const p of data) {
      if (p.sku) skuToId.set(String(p.sku).trim(), p.id);
      if (p.codigo_contpaqi) contpaqToId.set(String(p.codigo_contpaqi).trim(), p.id);
    }
    if (data.length < 1000) break;
    from += 1000;
  }
}
console.log(`Productos: ${skuToId.size} con sku, ${contpaqToId.size} con codigo_contpaqi\n`);

const now = new Date().toISOString();
for (const { file, warehouse } of FILES) {
  const rows = parse(`${DIR}/${file}`);
  const payload = [];
  const unresolved = [];
  for (const r of rows) {
    const id = skuToId.get(r.code) ?? contpaqToId.get(r.code);
    if (!id) { unresolved.push(r.code); continue; }
    payload.push({ product_id: id, warehouse, stock_quantity: r.stock, last_update: now,
      last_source: `Excel ${file} → ${warehouse}` });
  }
  const conStock = payload.filter((p) => p.stock_quantity > 0).length;
  console.log(`== ${warehouse}  (${file})`);
  console.log(`   filas: ${rows.length} | resuelven: ${payload.length} (${conStock} con existencia>0) | no encontrados: ${unresolved.length}`);
  if (unresolved.length) console.log(`   sin match: ${unresolved.slice(0, 15).join(", ")}${unresolved.length > 15 ? " …" : ""}`);

  if (APPLY) {
    let ok = 0;
    for (let i = 0; i < payload.length; i += 500) {
      const chunk = payload.slice(i, i + 500);
      const { error } = await db.from("product_warehouse_stock").upsert(chunk, { onConflict: "product_id,warehouse" });
      if (error) { console.log(`   ERROR upsert: ${error.message}`); break; }
      ok += chunk.length;
    }
    await db.from("inventory_imports").insert({
      import_type: "inventario_almacen",
      source_file_name: `Excel ${file} → ${warehouse}`,
      rows_total: rows.length,
      rows_ok: ok,
      rows_error: unresolved.length,
      error_log: unresolved.map((c) => ({ row: 0, message: `SKU/código ${c} no encontrado` })),
    });
    console.log(`   ✔ aplicado: ${ok} renglones upsert`);
  }
  console.log("");
}
console.log(APPLY ? "APLICADO." : "DRY-RUN (sin escribir). Corre con --apply para guardar.");
