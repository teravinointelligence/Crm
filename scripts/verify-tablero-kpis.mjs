// Verificación SOLO LECTURA del Tablero de KPIs (/tablero): ejecuta las mismas
// queries que lib/kpis/data.ts contra la BD real para validar columnas/joins y
// ver que los números salen con datos reales. Sale con código 1 si alguna
// query falla.
//
//   node scripts/verify-tablero-kpis.mjs
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = readFileSync(".env.local", "utf8");
const all = (key) =>
  [...env.matchAll(new RegExp(`^${key}=(.+)$`, "gm"))].map((m) => m[1].trim().split(/\s+#/)[0].trim());
const url = all("NEXT_PUBLIC_SUPABASE_URL")[0];
const key = all("SUPABASE_SERVICE_ROLE_KEY").reverse()[0];
const sb = createClient(url, key, { auth: { persistSession: false } });

const fail = (name, error) => {
  console.error(`FAIL ${name}:`, error.message ?? error);
  process.exitCode = 1;
};

async function q(name, builder) {
  const { data, error } = await builder;
  if (error) return fail(name, error), [];
  console.log(`OK   ${name}: ${Array.isArray(data) ? data.length : "?"} filas`);
  return data ?? [];
}

const now = new Date();
const monthISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
const fromMonth = monthISO(new Date(now.getFullYear(), now.getMonth() - 11, 1));
const toMonth = monthISO(now);
const today = now.toISOString().slice(0, 10);
const d30 = new Date(now.getTime() - 30 * 86400000).toISOString();

const sales = await q("monthly_sales", sb.from("monthly_sales")
  .select("id, account_id, sales_rep_id, period, venta_bruta, neto_desc")
  .gte("period", fromMonth).limit(2000));
await q("accounts", sb.from("accounts").select("id, business_name, region, status, assigned_rep_id").limit(10));
const reps = await q("sales_reps", sb.from("sales_reps")
  .select("id, full_name, last_seen_at").eq("active", true).in("role", ["admin", "rep"]).order("full_name"));
await q("v_account_balance", sb.from("v_account_balance").select("*").limit(5));
await q("v_account_last_activity", sb.from("v_account_last_activity")
  .select("account_id, business_name, region, status, assigned_rep_id, last_activity_date")
  .in("status", ["prospecto", "activo"]).limit(10));
await q("activities periodo", sb.from("activities")
  .select("sales_rep_id, account_id, activity_type, status, activity_date")
  .gte("activity_date", `${fromMonth}T00:00:00`).limit(10));
await q("activities 30d", sb.from("activities").select("account_id").gte("activity_date", d30).limit(10));
await q("next steps vencidos", sb.from("activities")
  .select("sales_rep_id, account_id, next_step, next_step_date")
  .eq("next_step_done", false).not("next_step_date", "is", null).lt("next_step_date", today)
  .order("next_step_date", { ascending: true }).limit(10));
await q("orders pipeline", sb.from("orders").select("total, sales_rep_id, account_id")
  .eq("order_type", "cotizacion").in("status", ["borrador", "enviada"]).limit(10));
await q("orders cerrado", sb.from("orders").select("total, sales_rep_id, account_id")
  .in("status", ["aceptada", "facturada", "entregada"]).gte("order_date", fromMonth).limit(10));
const items = await q("monthly_sales_items join", sb.from("monthly_sales_items")
  .select("monthly_sale_id, codigo, total, monthly_sales!inner(period)")
  .gte("monthly_sales.period", fromMonth).lte("monthly_sales.period", toMonth).limit(50));
const products = await q("products", sb.from("products").select("sku, codigo_contpaqi, category").limit(2000));

// Sanity de números
const periods = [...new Set(sales.map((s) => s.period.slice(0, 10)))].sort();
const mesRef = periods.at(-1);
const bruta = sales.filter((s) => s.period.slice(0, 10) === mesRef)
  .reduce((a, s) => a + Number(s.venta_bruta ?? 0), 0);
console.log(`\nPeriodos cargados (12m): ${periods.join(", ")}`);
console.log(`Mes de referencia: ${mesRef} · venta bruta: ${bruta.toLocaleString("es-MX", { style: "currency", currency: "MXN" })}`);
console.log(`Vendedores activos: ${reps.map((r) => r.full_name).join(", ")}`);

// Mix: qué % de códigos de items matchea el catálogo
const catByCode = new Map();
for (const p of products) {
  if (p.sku) catByCode.set(p.sku.trim(), p.category);
  if (p.codigo_contpaqi) catByCode.set(p.codigo_contpaqi.trim(), p.category);
}
const matched = items.filter((i) => i.codigo && catByCode.has(i.codigo.trim())).length;
console.log(`Mix: ${matched}/${items.length} renglones de muestra con categoría en el catálogo`);
