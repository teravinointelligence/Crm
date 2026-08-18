// Reasigna a Sabrina (admin) los PROSPECTOS que llevan N meses sin actividad de
// su vendedor, y de paso recoge los prospectos que quedaron sin dueño.
//
// Este script documenta y reproduce la reasignación manual del 2026-08-18.
// Es distinto del barrido automático (lib/reasignacion-inactivas.ts), que manda
// las cuentas al pool (assigned_rep_id = null) tras un aviso previo: aquí no hay
// aviso ni pool, las cuentas pasan directo a la admin para que ella las reparta.
//
// Criterio (todas las condiciones):
//   * status = 'prospecto'
//   * el dueño actual no es ya la admin
//   * sin actividad no cancelada en los últimos MESES meses
//   * creada hace más de MESES meses  → un prospecto recién registrado todavía
//     no ha tenido tiempo de trabajarse; no se le quita a nadie
//   * sin pedido ni cotización reciente de OTRO vendedor → un movimiento
//     comercial cuenta como seguimiento aunque no se haya capturado como
//     actividad. Si el movimiento lo hizo la propia admin, no protege la cuenta.
//
// Cada movimiento queda en account_reassignment_log con el dueño anterior, así
// que la operación es reversible.
//
// Uso:
//   DRY_RUN=1 node scripts/reasignar-prospectos-inactivos.mjs      # solo reporta
//   node scripts/reasignar-prospectos-inactivos.mjs                # aplica
//   MESES=3 node scripts/reasignar-prospectos-inactivos.mjs        # otro umbral
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

// --- cargar .env.local ---
const env = { ...process.env };
try {
  for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {
  // sin .env.local: se esperan las variables ya exportadas en el entorno
}

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const supabase = createClient(url, key, { auth: { persistSession: false } });

const DRY_RUN = !!env.DRY_RUN;
const MESES = Math.max(1, Math.round(Number(env.MESES) || 2));
const REASON = `inactividad >${MESES} meses — prospectos reasignados a la admin`;
const REASON_POOL = "prospecto sin vendedor asignado — pasa a la admin";

const cutoff = new Date();
cutoff.setMonth(cutoff.getMonth() - MESES);
const cutoffIso = cutoff.toISOString();

// --- admin destino ---
const { data: admins, error: adminErr } = await supabase
  .from("sales_reps")
  .select("id, full_name")
  .eq("role", "admin")
  .eq("active", true);
if (adminErr) throw adminErr;
if (admins?.length !== 1) {
  console.error(`Se esperaba exactamente 1 admin activo, hay ${admins?.length ?? 0}`);
  process.exit(1);
}
const admin = admins[0];

// --- prospectos que no son ya de la admin ---
const { data: prospectos, error: pErr } = await supabase
  .from("accounts")
  .select("id, business_name, assigned_rep_id, created_at")
  .eq("status", "prospecto");
if (pErr) throw pErr;

// --- última actividad no cancelada por cuenta ---
const { data: actividad, error: aErr } = await supabase
  .from("v_account_last_activity")
  .select("account_id, last_activity_date");
if (aErr) throw aErr;
const ultimaActividad = new Map(actividad.map((r) => [r.account_id, r.last_activity_date]));

// --- pedidos/cotizaciones recientes, por cuenta y vendedor ---
const { data: pedidos, error: oErr } = await supabase
  .from("orders")
  .select("account_id, sales_rep_id")
  .gte("created_at", cutoffIso);
if (oErr) throw oErr;
// Solo protegen las cuentas los movimientos de alguien distinto a la admin.
const conMovimientoAjeno = new Set(
  pedidos.filter((o) => o.sales_rep_id && o.sales_rep_id !== admin.id).map((o) => o.account_id),
);

const candidatas = prospectos.filter((a) => {
  if (a.assigned_rep_id === admin.id) return false;
  const ult = ultimaActividad.get(a.id);
  if (ult && new Date(ult) >= cutoff) return false;
  if (new Date(a.created_at) >= cutoff) return false;
  if (conMovimientoAjeno.has(a.id)) return false;
  return true;
});

// --- resumen por vendedor ---
const nombres = new Map((await supabase.from("sales_reps").select("id, full_name")).data.map((r) => [r.id, r.full_name]));
const porVendedor = new Map();
for (const a of candidatas) {
  const k = a.assigned_rep_id ? nombres.get(a.assigned_rep_id) ?? a.assigned_rep_id : "(sin vendedor)";
  porVendedor.set(k, (porVendedor.get(k) ?? 0) + 1);
}

console.log(`Umbral: ${MESES} meses (corte ${cutoffIso.slice(0, 10)})`);
console.log(`Destino: ${admin.full_name}`);
console.log(`Prospectos a reasignar: ${candidatas.length}`);
for (const [rep, n] of [...porVendedor].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(4)}  ${rep}`);
}

if (DRY_RUN) {
  console.log("\nDRY_RUN: no se escribió nada.");
  process.exit(0);
}
if (!candidatas.length) process.exit(0);

// --- aplicar en lotes ---
const LOTE = 100;
const ahora = new Date().toISOString();
let reasignadas = 0;
for (let i = 0; i < candidatas.length; i += LOTE) {
  const lote = candidatas.slice(i, i + LOTE);
  const { error: upErr } = await supabase
    .from("accounts")
    .update({
      assigned_rep_id: admin.id,
      reassign_warned_at: null,
      // reloj de inactividad en cero: la cuenta empieza de nuevo con su dueña
      activity_baseline_at: ahora,
      updated_at: ahora,
    })
    .in("id", lote.map((a) => a.id));
  if (upErr) {
    console.error(`Error al reasignar lote ${i / LOTE + 1}: ${upErr.message}`);
    continue;
  }
  const { error: logErr } = await supabase.from("account_reassignment_log").insert(
    lote.map((a) => ({
      account_id: a.id,
      from_rep_id: a.assigned_rep_id,
      to_rep_id: admin.id,
      reason: a.assigned_rep_id ? REASON : REASON_POOL,
    })),
  );
  if (logErr) console.error(`Error en bitácora lote ${i / LOTE + 1}: ${logErr.message}`);
  reasignadas += lote.length;
}

console.log(`\nListo: ${reasignadas} prospectos reasignados a ${admin.full_name}.`);
console.log("El dueño anterior de cada cuenta quedó en account_reassignment_log.");
