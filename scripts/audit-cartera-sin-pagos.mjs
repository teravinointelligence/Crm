// Auditoría de cartera: cuentas con saldo pendiente y CERO pagos aplicados
// (saldo probablemente inflado). SOLO LECTURA — genera un .xlsx para revisar.
//
//   node scripts/audit-cartera-sin-pagos.mjs
//
// Salida: public/templates/auditoria_cartera_sin_pagos.xlsx (o ./ si prefieres).

import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import * as XLSX from "xlsx";

// --- Lee credenciales del CRM desde .env.local (NO las de reparto) ---
const env = readFileSync(".env.local", "utf8");
const all = (key) =>
  [...env.matchAll(new RegExp(`^${key}=(.+)$`, "gm"))].map((m) => m[1].trim().split(/\s+#/)[0].trim());
const url = all("NEXT_PUBLIC_SUPABASE_URL")[0];
// Hay varias líneas SUPABASE_SERVICE_ROLE_KEY=; probamos cada una y usamos la que autentique.
const candidates = all("SUPABASE_SERVICE_ROLE_KEY").reverse();
if (!url || !candidates.length) throw new Error("Faltan credenciales del CRM en .env.local");

let db = null;
for (const key of candidates) {
  const c = createClient(url, key, { auth: { persistSession: false } });
  const { error } = await c.from("accounts").select("id", { head: true, count: "exact" }).limit(1);
  if (!error) { db = c; break; }
}
if (!db) throw new Error("Ninguna SUPABASE_SERVICE_ROLE_KEY de .env.local autenticó");

// 1) Cuentas con saldo > 0 y sin pagos (total_pagado = 0) desde la vista.
const { data: bal, error: e1 } = await db
  .from("v_account_balance")
  .select("account_id, business_name, assigned_rep_id, total_facturado, total_pagado, saldo_pendiente, saldo_vencido, facturas_abiertas")
  .eq("total_pagado", 0)
  .gt("saldo_pendiente", 0)
  .order("saldo_pendiente", { ascending: false });
if (e1) throw e1;

const ids = bal.map((b) => b.account_id);

// 2) Metadatos de la cuenta (# cliente, estatus).
const { data: accts, error: e2 } = await db
  .from("accounts")
  .select("id, client_number, status, assigned_rep_id")
  .in("id", ids);
if (e2) throw e2;
const acctById = new Map(accts.map((a) => [a.id, a]));

// 3) Vendedores (nombre).
const { data: reps, error: e3 } = await db.from("sales_reps").select("id, full_name");
if (e3) throw e3;
const repById = new Map((reps ?? []).map((r) => [r.id, r.full_name]));

// 4) Antigüedad: min/max fecha de factura abierta por cuenta (paginado).
const minDate = new Map();
const maxDate = new Map();
const PAGE = 1000;
for (let from = 0; ; from += PAGE) {
  const { data: inv, error } = await db
    .from("invoices")
    .select("account_id, invoice_date")
    .in("account_id", ids)
    .neq("status", "cancelada")
    .gt("balance", 0)
    .range(from, from + PAGE - 1);
  if (error) throw error;
  for (const r of inv) {
    const d = r.invoice_date;
    if (!minDate.has(r.account_id) || d < minDate.get(r.account_id)) minDate.set(r.account_id, d);
    if (!maxDate.has(r.account_id) || d > maxDate.get(r.account_id)) maxDate.set(r.account_id, d);
  }
  if (inv.length < PAGE) break;
}

// --- Construye filas ---
const headers = [
  "# Cliente", "Cliente", "Estatus", "Vendedor",
  "Facturas abiertas", "Saldo inflado (sin pagos)", "Saldo vencido",
  "Factura más vieja", "Factura más nueva", "¿Tiene facturas pre-2024?",
];
const rows = bal.map((b) => {
  const a = acctById.get(b.account_id) ?? {};
  const repId = b.assigned_rep_id ?? a.assigned_rep_id;
  const vieja = minDate.get(b.account_id) ?? "";
  return [
    a.client_number ?? "",
    b.business_name ?? "",
    a.status ?? "",
    repById.get(repId) ?? "",
    Number(b.facturas_abiertas) || 0,
    Number(b.saldo_pendiente) || 0,
    Number(b.saldo_vencido) || 0,
    vieja,
    maxDate.get(b.account_id) ?? "",
    vieja && vieja < "2024-01-01" ? "SÍ" : "",
  ];
});

const total = rows.reduce((s, r) => s + r[5], 0);
const totalPre = rows.filter((r) => r[9] === "SÍ").reduce((s, r) => s + r[5], 0);

const wsData = [
  headers,
  ...rows,
  [],
  ["TOTAL", "", "", "", rows.reduce((s, r) => s + r[4], 0), total, "", "", "", ""],
  ["TOTAL en cuentas con facturas pre-2024", "", "", "", "", totalPre, "", "", "", ""],
];
const ws = XLSX.utils.aoa_to_sheet(wsData);
ws["!cols"] = [
  { wch: 10 }, { wch: 40 }, { wch: 12 }, { wch: 22 },
  { wch: 16 }, { wch: 22 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 22 },
];

const info = [
  ["AUDITORÍA DE CARTERA — CUENTAS CON SALDO Y CERO PAGOS APLICADOS"],
  [`Generado: ${new Date().toISOString().slice(0, 10)}`],
  [""],
  ["Qué muestra:"],
  ["Cada fila es una cuenta que tiene facturas con saldo pendiente pero a la que NUNCA"],
  ["se le ha aplicado un pago en el CRM. Su saldo está probablemente inflado (igual que"],
  ["estaba Nemi antes de conciliarla)."],
  [""],
  ["'Saldo inflado' = suma del balance de sus facturas abiertas (lo que el CRM cree que debe)."],
  ["'¿Tiene facturas pre-2024?' = SÍ marca cuentas con facturas de 2021-2023, casi seguro ya pagadas."],
  [""],
  ["Cómo usarlo:"],
  ["1. Revisa especialmente las marcadas 'SÍ' (pre-2024) y las de mayor saldo."],
  ["2. Para cada cuenta que quieras corregir, consigue su cartera real (estado de cuenta CONTPAQi)."],
  ["3. Se concilia igual que Nemi: se registran los pagos de lo ya liquidado y se deja lo abierto."],
  [""],
  ["NOTA: este archivo NO modifica nada. Es solo para revisión."],
];
const wsInfo = XLSX.utils.aoa_to_sheet(info);
wsInfo["!cols"] = [{ wch: 95 }];

const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, "Cuentas sin pagos");
XLSX.utils.book_append_sheet(wb, wsInfo, "Instrucciones");

mkdirSync("public/templates", { recursive: true });
const out = "public/templates/auditoria_cartera_sin_pagos.xlsx";
writeFileSync(out, XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
console.log(`Generado: ${out}`);
console.log(`Cuentas: ${rows.length} · Saldo inflado total: $${total.toLocaleString("es-MX", { minimumFractionDigits: 2 })}`);
console.log(`De ésas, con facturas pre-2024: $${totalPre.toLocaleString("es-MX", { minimumFractionDigits: 2 })}`);
