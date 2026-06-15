// Snapshot de regresión del programa Gerard Bertrand (Fase 0 de Bogle).
// Genera/compara el agregado por vendedor (facturado y cobrado, periodo
// completo del programa) usando get_incentive_detail — la misma función
// que alimenta la UI. Uso:
//   node scripts/snapshot-gb.mjs            → imprime el agregado actual
//   node scripts/snapshot-gb.mjs --check    → compara contra el snapshot
//                                             scripts/gb-snapshot.json y
//                                             sale 1 si difiere
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "node:fs";

const env = readFileSync(".env.local", "utf8");
const all = (k) => [...env.matchAll(new RegExp(`^${k}=(.+)$`, "gm"))].map((m) => m[1].trim().split(/\s+#/)[0].trim());
const url = all("NEXT_PUBLIC_SUPABASE_URL")[0];
let db = null;
for (const key of all("SUPABASE_SERVICE_ROLE_KEY").reverse()) {
  const c = createClient(url, key, { auth: { persistSession: false } });
  const { error } = await c.from("accounts").select("id", { head: true, count: "exact" }).limit(1);
  if (!error) { db = c; break; }
}
if (!db) throw new Error("sin credenciales");

const { data: program } = await db.from("incentive_programs").select("id").eq("name", "Gerard Bertrand 2026").single();
const { data, error } = await db.rpc("get_incentive_detail", { p_program_id: program.id, p_require_paid: false });
if (error) throw new Error(error.message);

const agg = {};
for (const d of data) {
  const a = (agg[d.rep_name] ??= { pts_facturado: 0, pts_cobrado: 0, bot_facturado: 0 });
  a.pts_facturado += Number(d.points);
  a.bot_facturado += Number(d.bottles);
  if (d.cobrado) a.pts_cobrado += Number(d.points);
}
for (const a of Object.values(agg)) for (const k in a) a[k] = Math.round(a[k] * 100) / 100;

if (process.argv.includes("--check")) {
  const snap = JSON.parse(readFileSync("scripts/gb-snapshot.json", "utf8"));
  const diffs = [];
  for (const rep of new Set([...Object.keys(snap.porVendedor), ...Object.keys(agg)])) {
    const s = JSON.stringify(snap.porVendedor[rep]), c = JSON.stringify(agg[rep]);
    if (s !== c) diffs.push(`${rep}: snapshot=${s} actual=${c}`);
  }
  if (diffs.length) {
    console.error("✗ REGRESIÓN GB — el programa cambió respecto al snapshot:");
    for (const d of diffs) console.error("  " + d);
    console.error("(Si el cambio es por pagos/ventas nuevas legítimas, regenera el snapshot sin --check.)");
    process.exit(1);
  }
  console.log("✓ GB sin cambios vs snapshot del " + snap.fecha);
} else {
  writeFileSync("scripts/gb-snapshot.json", JSON.stringify({ fecha: new Date().toISOString().slice(0, 10), nota: "Agregado por vendedor de get_incentive_detail (facturado/cobrado, periodo completo). Tomado en Fase 0 de Bogle.", porVendedor: agg }, null, 2));
  console.log("Snapshot guardado en scripts/gb-snapshot.json:");
  console.table(agg);
}
