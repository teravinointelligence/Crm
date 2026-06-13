// Validación del módulo de Incentivos frente al corte oficial Gerard
// Bertrand del 21-may-2026 (periodo ene–abr 2026). SOLO LECTURA.
//
//   node scripts/verify-incentivos-gb.mjs
//
// HISTORIA DEL CRITERIO (2026-06-12, decisión de dirección):
// Al reproducir el corte con las reglas oficiales del programa (tabla de
// categorías GB) el CRM cuenta MÁS que el corte: el corte de mayo estaba
// INCOMPLETO — omitió la línea Héritage VDN (Banyuls/Muscat), el Héritage
// An 940/Picpoul/Aspres, y las ~168 botellas de Pinot Noir 940 de Kerzner
// Palmilla (#269), que dirección confirmó que SÍ cuentan. Por eso:
//   · La comparación por vendedor vs el corte es INFORMATIVA (se imprime
//     con su explicación; no truena el script).
//   · Lo que SÍ es bloqueante: meses ene–abr importados y las señales
//     estructurales del corte que deben existir tal cual (Íconos de Andra
//     a #176/#141, Châteaux de Emmanuel a #361). Si esas fallan, hay un
//     bug de matching o datos rotos.
// Nunca ajustar el cálculo para "cuadrar" con el corte.

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

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

// --- Corte oficial GB al 21-may-2026 (ene–abr, facturado) — INCOMPLETO, ver arriba ---
const GOLDEN = [
  { rep: "Andra", bottles: 57, points: 741 },
  { rep: "Yamile", bottles: 133, points: 183 },
  { rep: "Felix", bottles: 142, points: 174 },
  { rep: "Emmanuel", bottles: 31, points: 153 },
  { rep: "Citlali", bottles: 0, points: 0 },
];
const PERIODO = { desde: "2026-01-01", hasta: "2026-04-30" };

let failures = 0;
const ok = (label) => console.log(`  ✓ ${label}`);
const bad = (label, detail) => { failures += 1; console.error(`  ✗ ${label}: ${detail}`); };
const info = (label) => console.log(`  · ${label}`);

// --- 1. BLOQUEANTE: meses ene–abr importados ---
const { data: periodos } = await db
  .from("monthly_sales").select("period")
  .gte("period", PERIODO.desde).lte("period", PERIODO.hasta);
const meses = [...new Set((periodos ?? []).map((p) => p.period))].sort();
const faltantes = ["2026-01-01", "2026-02-01", "2026-03-01", "2026-04-01"].filter((m) => !meses.includes(m));
console.log(`\nPeriodos ene–abr en monthly_sales: ${meses.join(", ") || "(ninguno)"}`);
if (faltantes.length) bad("Meses sin importar", faltantes.join(", "));

const { data: program } = await db
  .from("incentive_programs").select("id").eq("name", "Gerard Bertrand 2026").single();
if (!program) throw new Error("No existe el programa 'Gerard Bertrand 2026' (¿migración 0054 aplicada?)");

const { data: detalle, error: errDet } = await db.rpc("get_incentive_detail", {
  p_program_id: program.id,
  p_require_paid: false,
});
if (errDet) throw new Error(`get_incentive_detail: ${errDet.message}`);
const enAbr = detalle.filter((d) => d.period >= PERIODO.desde && d.period <= PERIODO.hasta);

const firstName = (s) => s.split(/\s+/)[0];
const porRep = new Map();
for (const d of enAbr) {
  const k = firstName(d.rep_name);
  const r = porRep.get(k) ?? { bottles: 0, points: 0, cats: new Map(), clientes: new Map() };
  r.bottles += Number(d.bottles);
  r.points += Number(d.points);
  const cat = r.cats.get(d.category) ?? { bottles: 0, points: 0 };
  cat.bottles += Number(d.bottles);
  cat.points += Number(d.points);
  r.cats.set(d.category, cat);
  const ck = `${d.client_number}|${d.category}`;
  r.clientes.set(ck, (r.clientes.get(ck) ?? 0) + Number(d.points));
  porRep.set(k, r);
}

// --- 2. BLOQUEANTE: señales estructurales del corte (deben existir tal cual) ---
console.log("\n— Señales estructurales (bloqueantes) —");
const andra = porRep.get("Andra");
const a176 = andra?.clientes.get("176|Íconos") ?? 0;
const a141 = andra?.clientes.get("141|Íconos") ?? 0;
if (a176 >= 450 && a141 >= 50) {
  ok(`Andra: Íconos a #176 (${a176} pts) y #141 (${a141} pts)`);
} else {
  bad("Andra Íconos #176/#141", `#176=${a176} pts, #141=${a141} pts (el corte registra ~500 y 50)`);
}
const emm361 = porRep.get("Emmanuel")?.clientes.get("361|Châteaux") ?? 0;
if (emm361 === 60) {
  ok("Emmanuel: 60 pts Châteaux a #361 (Cigalus Tinto)");
} else {
  bad("Emmanuel #361", `${emm361} pts Châteaux (el corte registra 60)`);
}

// --- 3. INFORMATIVO: comparación vs corte oficial (documentado incompleto) ---
console.log("\n— Comparativo vs corte oficial 21-may (INFORMATIVO: el corte omitió VDN, An 940/Picpoul/Aspres y Kerzner #269) —");
let totB = 0, totP = 0;
for (const g of GOLDEN) {
  const r = porRep.get(g.rep) ?? { bottles: 0, points: 0 };
  totB += r.bottles; totP += r.points;
  const dB = r.bottles - g.bottles, dP = r.points - g.points;
  info(`${g.rep.padEnd(9)} corte=${String(g.bottles).padStart(3)} bot/${String(g.points).padStart(4)} pts · CRM=${String(r.bottles).padStart(3)} bot/${String(Math.round(r.points)).padStart(4)} pts (Δ ${dB >= 0 ? "+" : ""}${dB} bot / ${dP >= 0 ? "+" : ""}${Math.round(dP)} pts)`);
}
info(`TOTAL     corte=363 bot/1251 pts · CRM=${totB} bot/${Math.round(totP)} pts`);
const repsBajo = GOLDEN.filter((g) => {
  const r = porRep.get(g.rep) ?? { bottles: 0, points: 0 };
  return r.points < g.points - 60; // margen: faltantes graves no explicados
});
if (repsBajo.length) {
  console.log(`  ⚠ Por DEBAJO del corte (revisar ventas no importadas / atribución de cuentas): ${repsBajo.map((g) => g.rep).join(", ")}`);
}

// --- 4. INFORMATIVO: productos GB sin mapear ---
const { data: unmapped } = await db.rpc("get_incentive_unmapped", { p_program_id: program.id });
if (unmapped?.length) {
  console.log(`\n— Productos GB vendidos SIN mapear (${unmapped.length}) — decidir en /incentivos/gestion:`);
  for (const u of unmapped) console.log(`    · ${u.codigo} — ${u.producto_nombre} (${u.bottles} bot)`);
}

console.log("");
if (failures) {
  console.error(`✗ ${failures} check(s) bloqueante(s) fallaron.`);
  process.exit(1);
}
console.log("✓ Checks bloqueantes en verde. El comparativo vs corte es informativo (corte documentado como incompleto).");
