// Verificación: el total "Facturado" de Reportes debe coincidir con la venta
// bruta del módulo Ventas para el mismo periodo (misma fuente: monthly_sales).
// SOLO LECTURA. Sale con código 1 si hay discrepancia.
//
//   node scripts/verify-reportes-ventas.mjs
//
// Compara, por cada mes con ventas y para el año en curso:
//   - Ventas:   sum(venta_bruta) de monthly_sales (lo que muestra /ventas)
//   - Reportes: la misma agregación que hace /reportes (rango de meses),
//     más los desgloses por vendedor y por región (deben sumar el total).

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

// --- Lee credenciales del CRM desde .env.local (NO las de reparto) ---
const env = readFileSync(".env.local", "utf8");
const all = (key) =>
  [...env.matchAll(new RegExp(`^${key}=(.+)$`, "gm"))].map((m) => m[1].trim().split(/\s+#/)[0].trim());
const url = all("NEXT_PUBLIC_SUPABASE_URL")[0];
const candidates = all("SUPABASE_SERVICE_ROLE_KEY").reverse();
if (!url || !candidates.length) throw new Error("Faltan credenciales del CRM en .env.local");

let db = null;
for (const key of candidates) {
  const c = createClient(url, key, { auth: { persistSession: false } });
  const { error } = await c.from("accounts").select("id", { head: true, count: "exact" }).limit(1);
  if (!error) { db = c; break; }
}
if (!db) throw new Error("Ninguna SUPABASE_SERVICE_ROLE_KEY de .env.local autenticó");

const peso = (n) => n.toLocaleString("es-MX", { style: "currency", currency: "MXN" });
const close = (a, b) => Math.abs(a - b) < 0.01; // tolerancia de centavos por redondeo

let failures = 0;
const check = (label, expected, actual) => {
  if (close(expected, actual)) {
    console.log(`  ✓ ${label}: ${peso(actual)}`);
  } else {
    failures += 1;
    console.error(`  ✗ ${label}: Ventas=${peso(expected)} vs Reportes=${peso(actual)} (Δ ${peso(actual - expected)})`);
  }
};

// Agregación "Reportes": mismas consultas que app/(app)/reportes/page.tsx.
async function reportesAggregate(fromMonth, toMonth) {
  const { data, error } = await db
    .from("monthly_sales")
    .select("account_id, sales_rep_id, venta_bruta, accounts:account_id(region)")
    .gte("period", fromMonth)
    .lte("period", toMonth)
    .limit(10000);
  if (error) throw error;
  const total = data.reduce((s, v) => s + Number(v.venta_bruta ?? 0), 0);
  const porVendedor = new Map();
  const porRegion = new Map();
  for (const v of data) {
    const rep = v.sales_rep_id ?? "sin";
    porVendedor.set(rep, (porVendedor.get(rep) ?? 0) + Number(v.venta_bruta ?? 0));
    const reg = v.accounts?.region ?? "Sin región";
    porRegion.set(reg, (porRegion.get(reg) ?? 0) + Number(v.venta_bruta ?? 0));
  }
  const sumVendedor = [...porVendedor.values()].reduce((s, n) => s + n, 0);
  const sumRegion = [...porRegion.values()].reduce((s, n) => s + n, 0);
  return { total, sumVendedor, sumRegion, filas: data.length };
}

// 1) Periodos con ventas (lo que lista el selector de /ventas).
const { data: periodsRaw, error: pErr } = await db
  .from("monthly_sales")
  .select("period, venta_bruta")
  .limit(50000);
if (pErr) throw pErr;
const ventasPorPeriodo = new Map();
for (const r of periodsRaw) {
  ventasPorPeriodo.set(r.period, (ventasPorPeriodo.get(r.period) ?? 0) + Number(r.venta_bruta ?? 0));
}
const periodos = [...ventasPorPeriodo.keys()].sort();
if (!periodos.length) {
  console.log("No hay ventas en monthly_sales; nada que verificar.");
  process.exit(0);
}

// 2) Por cada mes: total de Ventas vs total de Reportes para ese mes.
for (const p of periodos) {
  console.log(`\nPeriodo ${p.slice(0, 7)}:`);
  const esperado = ventasPorPeriodo.get(p);
  const rep = await reportesAggregate(p, p);
  check("Facturado (KPI)", esperado, rep.total);
  check("Ventas por vendedor (suma gráfica)", esperado, rep.sumVendedor);
  check("Ventas por región (suma gráfica)", esperado, rep.sumRegion);
}

// 3) "Año actual" (ytd): suma de todos los meses del año vs rango de Reportes.
const year = new Date().getFullYear();
const now = new Date();
const thisMonth = `${year}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
const esperadoYtd = periodos
  .filter((p) => p >= `${year}-01-01` && p <= thisMonth)
  .reduce((s, p) => s + ventasPorPeriodo.get(p), 0);
console.log(`\nAño actual (${year} a la fecha):`);
const repYtd = await reportesAggregate(`${year}-01-01`, thisMonth);
check("Facturado (KPI ytd)", esperadoYtd, repYtd.total);

console.log(
  failures === 0
    ? "\n✓ Reportes y Ventas coinciden en todos los periodos."
    : `\n✗ ${failures} discrepancia(s) entre Reportes y Ventas.`,
);
process.exit(failures === 0 ? 0 : 1);
