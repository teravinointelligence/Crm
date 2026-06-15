// Auditoría del catálogo: detecta categorías y datos (país/varietal/añada/
// formato) probablemente incorrectos, por REGLAS. SOLO LECTURA — no modifica
// nada en la BD. Reusa el mismo motor que la app (lib/catalogo/normalize.mjs).
//
//   node scripts/audit-catalogo.mjs
//
// Salida: tabla en consola (discrepancias de categoría) + un .xlsx con TODAS
// las sugerencias en public/templates/auditoria_catalogo.xlsx.

import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import * as XLSX from "xlsx";
import { analyzeProduct, CATEGORY_LABEL } from "../lib/catalogo/normalize.mjs";

// --- Credenciales del CRM desde .env.local (mismo patrón que audit-cartera) ---
const env = readFileSync(".env.local", "utf8");
const all = (key) =>
  [...env.matchAll(new RegExp(`^${key}=(.+)$`, "gm"))].map((m) => m[1].trim().split(/\s+#/)[0].trim());
const url = all("NEXT_PUBLIC_SUPABASE_URL")[0];
const candidates = all("SUPABASE_SERVICE_ROLE_KEY").reverse();
if (!url || !candidates.length) throw new Error("Faltan credenciales del CRM en .env.local");

let db = null;
for (const key of candidates) {
  const c = createClient(url, key, { auth: { persistSession: false } });
  const { error } = await c.from("products").select("id", { head: true, count: "exact" }).limit(1);
  if (!error) { db = c; break; }
}
if (!db) throw new Error("Ninguna SUPABASE_SERVICE_ROLE_KEY de .env.local autenticó");

// --- Lee el catálogo completo ---
const { data: products, error } = await db
  .from("products")
  .select("id, sku, name, supplier, category, varietal, country, region_origin, vintage, volume_ml")
  .order("name");
if (error) throw error;

const lbl = (c) => (c ? CATEGORY_LABEL[c] ?? c : "—");
const fmtVol = (v) => (v == null ? "—" : v >= 1000 && v % 1000 === 0 ? `${v / 1000} L` : `${v} ml`);

const allRows = [];
const categoryFixes = [];
let ambiguous = 0;

for (const p of products) {
  const { suggestions, categoryAmbiguous } = analyzeProduct(p);
  if (categoryAmbiguous) ambiguous += 1;
  for (const s of suggestions) {
    const current = s.field === "volume_ml" ? fmtVol(s.current) : s.field === "category" ? lbl(s.current) : (s.current ?? "—");
    const suggested = s.field === "volume_ml" ? fmtVol(s.suggested) : s.field === "category" ? lbl(s.suggested) : s.suggested;
    allRows.push({
      SKU: p.sku ?? "",
      Producto: p.name,
      Proveedor: p.supplier ?? "",
      Campo: s.field,
      Actual: current,
      Sugerido: suggested,
      Confianza: s.confidence,
      Motivo: s.reason,
    });
    if (s.field === "category") {
      categoryFixes.push({ name: p.name, current: lbl(s.current), suggested: lbl(s.suggested), confidence: s.confidence });
    }
  }
}

// --- Consola: discrepancias de categoría ---
console.log(`\nCatálogo: ${products.length} productos · ${allRows.length} sugerencias · ${ambiguous} categorías ambiguas (candidatas a IA)\n`);
console.log("DISCREPANCIAS DE CATEGORÍA (por reglas):");
if (!categoryFixes.length) {
  console.log("  (ninguna)\n");
} else {
  for (const f of categoryFixes.sort((a, b) => a.confidence.localeCompare(b.confidence))) {
    console.log(`  [${f.confidence.toUpperCase().padEnd(5)}] ${f.name}\n           ${f.current}  →  ${f.suggested}`);
  }
  console.log("");
}

// --- XLSX con TODAS las sugerencias ---
mkdirSync("public/templates", { recursive: true });
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(allRows), "Sugerencias");
const outPath = "public/templates/auditoria_catalogo.xlsx";
writeFileSync(outPath, XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
console.log(`Reporte completo: ${outPath}\n`);
console.log("NOTA: este script NO modifica nada. Aplica los cambios desde Catálogo → Normalizar (con revisión).\n");
