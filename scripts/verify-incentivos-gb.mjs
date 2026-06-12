// Validación del módulo de Incentivos contra el corte oficial Gerard
// Bertrand del 21-may-2026 (golden set, periodo ene–abr 2026).
// SOLO LECTURA. Sale con código 1 si hay discrepancias.
//
//   node scripts/verify-incentivos-gb.mjs
//
// El corte oficial se calculó sobre FACTURADO (sin filtro de cobranza),
// por eso aquí se llama get_incentive_detail(..., require_paid=false) y
// se recorta a ene–abr. OJO: si monthly_sales aún no tiene ene–mar
// importados, el script lo detecta y lo reporta como bloqueante (no como
// bug del cálculo).
//
// Política del golden set: si los números NO cuadran, se reportan las
// diferencias para auditar matching de productos / datos faltantes.
// Nunca se "ajusta" el cálculo para que cuadre.

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

// --- Corte oficial GB al 21-may-2026 (ene–abr facturado) ---
const GOLDEN = [
  { rep: "Andra",    bottles: 57,  points: 741, nivel: "Plata" },
  { rep: "Yamile",   bottles: 133, points: 183, nivel: null },
  { rep: "Felix",    bottles: 142, points: 174, nivel: null },
  { rep: "Emmanuel", bottles: 31,  points: 153, nivel: null },
  { rep: "Citlali",  bottles: 0,   points: 0,   nivel: null },
];
const GOLDEN_TOTAL = { bottles: 363, points: 1251 };
const PERIODO = { desde: "2026-01-01", hasta: "2026-04-30" };

let failures = 0;
const ok = (label, extra = "") => console.log(`  ✓ ${label}${extra ? ` — ${extra}` : ""}`);
const bad = (label, detail) => { failures += 1; console.error(`  ✗ ${label}: ${detail}`); };

// --- 0. Prerrequisito: ¿están importados ene–mar en monthly_sales? ---
const { data: periodos } = await db
  .from("monthly_sales")
  .select("period")
  .gte("period", PERIODO.desde)
  .lte("period", PERIODO.hasta);
const meses = [...new Set((periodos ?? []).map((p) => p.period))].sort();
const esperados = ["2026-01-01", "2026-02-01", "2026-03-01", "2026-04-01"];
const faltantes = esperados.filter((m) => !meses.includes(m));
console.log(`\nPeriodos ene–abr en monthly_sales: ${meses.join(", ") || "(ninguno)"}`);
if (faltantes.length) {
  console.error(
    `\n⚠ BLOQUEANTE: faltan por importar a Ventas los meses ${faltantes.join(", ")}.\n` +
      `  El golden set (ene–abr) no puede cuadrar sin esos datos. Los checks se\n` +
      `  corren de todos modos para ver el avance parcial, pero las diferencias\n` +
      `  por datos faltantes NO son un bug del cálculo.\n`,
  );
}

// --- 1. Detalle en modo "facturado" (como el corte oficial) ---
const { data: program } = await db
  .from("incentive_programs")
  .select("id")
  .eq("name", "Gerard Bertrand 2026")
  .single();
if (!program) throw new Error("No existe el programa 'Gerard Bertrand 2026' (¿migración 0054 aplicada?)");

const { data: detalle, error: errDet } = await db.rpc("get_incentive_detail", {
  p_program_id: program.id,
  p_require_paid: false,
});
if (errDet) throw new Error(`get_incentive_detail: ${errDet.message}`);

const enAbr = detalle.filter((d) => d.period >= PERIODO.desde && d.period <= PERIODO.hasta);

// Primer nombre del rep para casar con el corte oficial ("Andra Verea" → "Andra")
const firstName = (s) => s.split(/\s+/)[0];
const porRep = new Map();
for (const d of enAbr) {
  const k = firstName(d.rep_name);
  const r = porRep.get(k) ?? { bottles: 0, points: 0, cats: new Map(), clientes: new Map() };
  r.bottles += Number(d.bottles);
  r.points += Number(d.points);
  r.cats.set(d.category, {
    bottles: (r.cats.get(d.category)?.bottles ?? 0) + Number(d.bottles),
    points: (r.cats.get(d.category)?.points ?? 0) + Number(d.points),
  });
  const ck = `${d.client_number}|${d.category}`;
  r.clientes.set(ck, (r.clientes.get(ck) ?? 0) + Number(d.points));
  porRep.set(k, r);
}

console.log("— Golden set por vendedor (ene–abr, modo facturado) —");
let totB = 0, totP = 0;
for (const g of GOLDEN) {
  const r = porRep.get(g.rep) ?? { bottles: 0, points: 0 };
  totB += r.bottles; totP += r.points;
  if (r.bottles === g.bottles && r.points === g.points) {
    ok(`${g.rep}: ${r.bottles} botellas / ${r.points} pts`);
  } else {
    bad(
      g.rep,
      `oficial=${g.bottles} bot / ${g.points} pts · CRM=${r.bottles} bot / ${r.points} pts ` +
        `(Δ ${r.bottles - g.bottles} bot / ${r.points - g.points} pts)`,
    );
  }
}
if (totB === GOLDEN_TOTAL.bottles && totP === GOLDEN_TOTAL.points) {
  ok(`TOTAL: ${totB} botellas / ${totP} pts`);
} else {
  bad("TOTAL", `oficial=${GOLDEN_TOTAL.bottles} bot / ${GOLDEN_TOTAL.points} pts · CRM=${totB} bot / ${totP} pts`);
}

// --- 2. Checks puntuales del corte ---
console.log("\n— Checks puntuales —");
const andra = porRep.get("Andra");
const iconos = andra?.cats.get("Íconos");
if (iconos?.bottles === 10 && iconos?.points === 500) {
  ok("Andra: 10 botellas Íconos = 500 pts");
} else {
  bad("Andra Íconos", `esperado 10 bot/500 pts, CRM=${iconos?.bottles ?? 0} bot/${iconos?.points ?? 0} pts`);
}
const a176 = andra?.clientes.get("176|Íconos") ?? 0;
const a141 = andra?.clientes.get("141|Íconos") ?? 0;
if (a176 > 0 && a141 > 0) {
  ok(`Andra: Íconos a clientes #176 (${a176} pts) y #141 (${a141} pts)`);
} else {
  bad("Andra clientes Íconos", `#176=${a176} pts, #141=${a141} pts (se esperaban >0 en ambos)`);
}

const yam = porRep.get("Yamile")?.cats.get("Volumen");
if (yam?.bottles === 123 && yam?.points === 123) {
  ok("Yamile: 123 botellas Volumen = 123 pts");
} else {
  bad("Yamile Volumen", `esperado 123/123, CRM=${yam?.bottles ?? 0} bot/${yam?.points ?? 0} pts`);
}

const emm = porRep.get("Emmanuel");
const emmCh = emm?.cats.get("Châteaux");
if (emmCh?.points === 60) {
  ok("Emmanuel: 60 pts en Châteaux");
} else {
  bad("Emmanuel Châteaux", `esperado 60 pts, CRM=${emmCh?.points ?? 0} pts`);
}
const emm361 = emm?.clientes.get("361|Châteaux") ?? 0;
if (emm361 > 0) {
  ok(`Emmanuel: Châteaux a cliente #361 (${emm361} pts)`);
} else {
  bad("Emmanuel cliente #361", `0 pts Châteaux (se esperaba Cigalus Tinto)`);
}

// --- 3. Productos GB sin mapear (informativo) ---
const { data: unmapped } = await db.rpc("get_incentive_unmapped", { p_program_id: program.id });
if (unmapped?.length) {
  console.log(`\n— Productos GB vendidos SIN mapear (${unmapped.length}) — revisar en la UI admin:`);
  for (const u of unmapped) console.log(`    · ${u.codigo} — ${u.producto_nombre} (${u.bottles} bot)`);
}

console.log("");
if (failures) {
  console.error(`✗ ${failures} discrepancia(s).${faltantes.length ? " (Hay meses sin importar: ver bloqueante arriba.)" : " Auditar matching de productos y datos antes de tocar el cálculo."}`);
  process.exit(1);
}
console.log("✓ Golden set reproducido al 100%.");
