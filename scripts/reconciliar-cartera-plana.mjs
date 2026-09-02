// Conciliación de cartera contra un listado PLANO de "saldo neto"
// (plantilla del CRM: # Cliente / Folio / Fecha Emisión / Total = saldo pendiente).
//
//   node scripts/reconciliar-cartera-plana.mjs "<archivo.xlsx>"          → ANÁLISIS (no escribe)
//   node scripts/reconciliar-cartera-plana.mjs "<archivo.xlsx>" --apply  → APLICA
//
// Regla: el archivo es la foto de hoy. Las facturas que aparecen siguen abiertas
// con ese saldo; las que NO aparecen ya se pagaron. Los folios que el CRM no
// tiene se insertan como facturas nuevas.
//
// NO hace upsert del total: `balance` es columna generada (total - total_paid),
// así que sobreescribir `total` con el saldo neto corrompería las facturas que
// ya traen pagos aplicados. Los ajustes se hacen vía apply_payment.

import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "node:fs";
import * as XLSX from "xlsx";

const FILE = process.argv[2];
const APPLY = process.argv.includes("--apply");
if (!FILE) throw new Error("Uso: node scripts/reconciliar-cartera-plana.mjs <archivo.xlsx> [--apply]");

const ESP = { ene:1,feb:2,mar:3,abr:4,may:5,jun:6,jul:7,ago:8,sep:9,oct:10,nov:11,dic:12 };
function parseDate(v) {
  if (v == null || v === "") return null;
  if (v instanceof Date) return v.toISOString().slice(0,10);
  const s = String(v).trim();
  let m = /^(\d{1,2})[/-]([a-zA-Z]{3,4})[/-](\d{2,4})$/.exec(s);
  if (m) { const mo = ESP[m[2].toLowerCase().slice(0,3)]; if (mo) return `${m[3].length===2?"20"+m[3]:m[3]}-${String(mo).padStart(2,"0")}-${m[1].padStart(2,"0")}`; }
  m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s); if (m) return `${m[1]}-${m[2].padStart(2,"0")}-${m[3].padStart(2,"0")}`;
  m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/.exec(s); if (m) return `${m[3].length===2?"20"+m[3]:m[3]}-${m[2].padStart(2,"0")}-${m[1].padStart(2,"0")}`;
  return null;
}
const num = (v) => { if (typeof v === "number") return v; const n = Number(String(v??"").replace(/[$,\s]/g,"")); return Number.isNaN(n)?0:n; };
const normCli = (v) => { const s=String(v??"").trim().replace(/\.0+$/,""); if(!s)return null; return s.replace(/^0+/,"")||"0"; };
const money = (n) => "$" + Number(n).toLocaleString("es-MX",{minimumFractionDigits:2, maximumFractionDigits:2});

// ---------- archivo ----------
const wb = XLSX.read(readFileSync(FILE), { type:"buffer", cellDates:true });
const json = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval:"" });

const fileOpen = new Map(); // folio -> { saldo, clientNum, clientName, fecha, venc }
const fileErrors = [];
json.forEach((raw, i) => {
  const m = {};
  for (const [k,v] of Object.entries(raw)) m[k.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"").trim()] = v;
  const folio = String(m["folio"] ?? "").trim();
  const fecha = parseDate(m["fecha emision"] ?? m["fecha"]);
  const saldo = num(m["total"]);
  if (!folio) return fileErrors.push({ row:i+2, msg:"folio faltante" });
  if (!fecha) return fileErrors.push({ row:i+2, msg:`fecha inválida (${folio})` });
  if (saldo <= 0) return fileErrors.push({ row:i+2, msg:`total <= 0 (${folio})` });
  const prev = fileOpen.get(folio);
  fileOpen.set(folio, {
    saldo: Math.round(((prev?.saldo||0) + saldo)*100)/100,
    clientNum: normCli(m["# cliente"]),
    clientName: String(m["cliente"] ?? "").trim() || null,
    rfc: String(m["rfc"] ?? "").trim().toUpperCase() || null,
    fecha,
    venc: parseDate(m["fecha vencimiento"]),
    dup: !!prev,
  });
});
const fileTotal = [...fileOpen.values()].reduce((s,x)=>s+x.saldo,0);

console.log(`\n=== ARCHIVO ===`);
console.log(`Filas leídas: ${json.length} · folios únicos: ${fileOpen.size} · rechazadas: ${fileErrors.length}`);
fileErrors.slice(0,10).forEach(e=>console.log(`   fila ${e.row}: ${e.msg}`));
[...fileOpen.entries()].filter(([,v])=>v.dup).forEach(([f,v])=>console.log(`   OJO folio repetido, se sumó: ${f} → ${money(v.saldo)}`));
console.log(`Saldo total del archivo: ${money(fileTotal)}`);

// ---------- CRM ----------
const env = readFileSync(".env.local","utf8");
const all = (k)=>[...env.matchAll(new RegExp(`^${k}=(.+)$`,"gm"))].map(m=>m[1].trim().split(/\s+#/)[0].trim());
const url = all("NEXT_PUBLIC_SUPABASE_URL")[0];
let db=null;
for (const key of all("SUPABASE_SERVICE_ROLE_KEY").reverse()) {
  const c = createClient(url, key, { auth:{persistSession:false} });
  const { error } = await c.from("accounts").select("id",{head:true,count:"exact"}).limit(1);
  if(!error){ db=c; break; }
}
if(!db) throw new Error("Sin credenciales válidas en .env.local");

const pageAll = async (table, select, tweak = (q)=>q) => {
  const out=[];
  for (let from=0;;from+=1000){
    const { data, error } = await tweak(db.from(table).select(select)).range(from, from+999);
    if(error) throw error;
    out.push(...data);
    if(data.length<1000) break;
  }
  return out;
};

const accounts = await pageAll("accounts","id, client_number, business_name, fiscal_name, rfc, credit_days");
const acct = new Map(accounts.map(a=>[a.id,a]));
const byClientNum = new Map(), byRfc = new Map(), byName = new Map();
for (const a of accounts) {
  const cn = normCli(a.client_number);
  if (cn && !byClientNum.has(cn)) byClientNum.set(cn, a.id);
  if (a.rfc) byRfc.set(String(a.rfc).toUpperCase().trim(), a.id);
  if (a.fiscal_name) byName.set(String(a.fiscal_name).toUpperCase().trim(), a.id);
  if (a.business_name) byName.set(String(a.business_name).toUpperCase().trim(), a.id);
}

// TODAS las facturas del CRM (para saber si un folio ya existe aunque esté saldado)
const allInv = await pageAll("invoices","id, invoice_number, account_id, total, total_paid, balance, status, due_date, invoice_date");
const byFolio = new Map(allInv.map(i=>[i.invoice_number, i]));
const crmOpen = allInv.filter(i=>i.status!=="cancelada" && Number(i.balance||0) > 0);
const crmTotal = crmOpen.reduce((s,i)=>s+Number(i.balance||0),0);

// ---------- reconciliación ----------
const EPS = 0.05;
const toPayFull=[], toPayPartial=[], keepOpen=[], over=[];
for (const inv of crmOpen) {
  const f = fileOpen.get(inv.invoice_number);
  const bal = Number(inv.balance||0);
  if (!f) { toPayFull.push(inv); continue; }
  const diff = Math.round((bal - f.saldo)*100)/100;
  if (diff > EPS) toPayPartial.push({ inv, pay: diff, fileSaldo: f.saldo });
  else if (diff < -EPS) over.push({ inv, fileSaldo: f.saldo, bal });
  else keepOpen.push(inv);
}

// folios del archivo que el CRM no tiene abiertos
const openFolios = new Set(crmOpen.map(i=>i.invoice_number));
const toInsert = [], alreadyPaid = [], unresolved = [];
for (const [folio, f] of fileOpen) {
  if (openFolios.has(folio)) continue;
  const existing = byFolio.get(folio);
  if (existing) { alreadyPaid.push({ folio, f, existing }); continue; }
  const aid = (f.clientNum && byClientNum.get(f.clientNum))
    || (f.rfc && byRfc.get(f.rfc))
    || (f.clientName && byName.get(f.clientName.toUpperCase().trim()));
  if (!aid) { unresolved.push({ folio, f }); continue; }
  toInsert.push({ folio, f, aid });
}

const sum=(a,g)=>a.reduce((s,x)=>s+g(x),0);
const fullTotal = sum(toPayFull,i=>Number(i.balance||0));
const partialTotal = sum(toPayPartial,x=>x.pay);
const keepTotal = sum(keepOpen,i=>Number(i.balance||0));
const insertTotal = sum(toInsert,x=>x.f.saldo);
const unresolvedTotal = sum(unresolved,x=>x.f.saldo);
const paidAgainTotal = sum(alreadyPaid,x=>x.f.saldo);

// cuentas que quedarían en cero
const byAcct = new Map();
for (const i of crmOpen){ const a=byAcct.get(i.account_id)||{open:0,paid:0}; a.open++; byAcct.set(i.account_id,a); }
for (const i of toPayFull){ byAcct.get(i.account_id).paid++; }
const zeroed=[];
for (const [id,a] of byAcct){
  if(a.paid===a.open){
    const ac=acct.get(id)||{};
    zeroed.push({cli:ac.client_number,nom:ac.business_name,monto:sum(crmOpen.filter(i=>i.account_id===id),i=>Number(i.balance||0))});
  }
}
zeroed.sort((x,y)=>y.monto-x.monto);

console.log(`\n=== CRM (hoy) ===`);
console.log(`Facturas abiertas: ${crmOpen.length} · Saldo: ${money(crmTotal)}`);

console.log(`\n=== PLAN ===`);
console.log(`Quedan igual (folio en archivo, mismo saldo):  ${keepOpen.length} · ${money(keepTotal)}`);
console.log(`PAGO PARCIAL (archivo trae menos saldo):       ${toPayPartial.length} · abono ${money(partialTotal)}`);
console.log(`MARCAR PAGADAS (folio NO está en el archivo):  ${toPayFull.length} · ${money(fullTotal)}`);
console.log(`INSERTAR nuevas (folio nuevo para el CRM):     ${toInsert.length} · ${money(insertTotal)}`);
console.log(`\nSaldo CRM proyectado: ${money(crmTotal - fullTotal - partialTotal + insertTotal)}`);
console.log(`Saldo del archivo:    ${money(fileTotal)}`);
console.log(`Diferencia:           ${money(crmTotal - fullTotal - partialTotal + insertTotal - fileTotal)}  (debe ser ≈ ${money(unresolvedTotal)} de folios sin cuenta)`);

console.log(`\n=== ALERTAS ===`);
console.log(`Folios sin cuenta en el CRM (NO se cargan):    ${unresolved.length} · ${money(unresolvedTotal)}`);
const missAcct = new Map();
for (const u of unresolved){ const k=u.f.clientNum??"?"; const e=missAcct.get(k)||{n:0,monto:0,nom:u.f.clientName}; e.n++; e.monto+=u.f.saldo; missAcct.set(k,e); }
[...missAcct.entries()].sort((a,b)=>b[1].monto-a[1].monto).slice(0,20).forEach(([k,v])=>console.log(`   #${k} ${v.nom??""} · ${v.n} fact · ${money(v.monto)}`));
console.log(`\nFolios que el CRM ya daba por SALDADOS pero el archivo reabre: ${alreadyPaid.length} · ${money(paidAgainTotal)}`);
alreadyPaid.slice(0,15).forEach(x=>console.log(`   ${x.folio} · archivo ${money(x.f.saldo)} · CRM total ${money(x.existing.total)} pagado ${money(x.existing.total_paid??0)} status ${x.existing.status}`));
console.log(`\nFolios donde el archivo dice MÁS saldo que el CRM: ${over.length}`);
over.slice(0,15).forEach(x=>console.log(`   ${x.inv.invoice_number} · CRM ${money(x.bal)} → archivo ${money(x.fileSaldo)}`));
console.log(`\nCuentas que quedarían en CERO: ${zeroed.length}`);
zeroed.slice(0,15).forEach(z=>console.log(`   #${z.cli??"?"} ${z.nom??""} · ${money(z.monto)}`));

if (!APPLY) {
  console.log(`\n*** MODO ANÁLISIS — no se escribió nada. Corre con --apply para aplicar. ***\n`);
  process.exit(0);
}

// ---------- APLICAR ----------
const HOY = new Date().toISOString().slice(0,10);
const NOTE = `Conciliación cartera ${HOY} (CONTPAQi)`;
console.log(`\n*** APLICANDO… ***`);

// Respaldo para poder revertir: guarda el total_paid previo de cada factura tocada.
// Deshacer = borrar los `payments` con estas notas y restaurar total_paid.
const snapPath = process.env.SNAPSHOT_PATH || `/tmp/cartera-rollback-${HOY}.json`;
const touched = [...toPayFull.map(i=>i), ...toPayPartial.map(x=>x.inv)];
writeFileSync(snapPath, JSON.stringify({
  fecha: HOY, archivo: FILE, note: NOTE,
  invoices: touched.map(i=>({ id:i.id, invoice_number:i.invoice_number, total_paid_prev:i.total_paid, status_prev:i.status })),
}, null, 2));
console.log(`Respaldo de reversión: ${snapPath} (${touched.length} facturas)`);

// 1) insertar folios nuevos
let ins=0, insErr=0;
if (toInsert.length) {
  const payload = toInsert.map(({folio,f,aid}) => {
    const credit = acct.get(aid)?.credit_days ?? null;
    let due = f.venc;
    if (credit != null && f.fecha) {
      const d = new Date(f.fecha + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + Number(credit));
      due = d.toISOString().slice(0,10);
    }
    return {
      invoice_number: folio, account_id: aid, invoice_date: f.fecha,
      due_date: due ?? f.fecha, subtotal: null, iva: null, total: f.saldo,
      status: due && new Date(due) < new Date() ? "vencida" : "pendiente",
    };
  });
  for (let i=0;i<payload.length;i+=200){
    const chunk = payload.slice(i,i+200);
    const { error } = await db.from("invoices").insert(chunk);
    if (error) { insErr += chunk.length; console.log("  ERR insert:", error.message); }
    else ins += chunk.length;
  }
}
console.log(`Facturas nuevas insertadas: ${ins} (errores: ${insErr})`);

// 2) pagos (full + parcial)
let ok=0, err=0;
const applyOne = async (accountId, amount, date, note, invoiceId) => {
  const { error } = await db.rpc("apply_payment", {
    p_account_id: accountId, p_amount: amount, p_payment_date: date,
    p_method: "otro", p_reference: null, p_notes: note, p_invoice_id: invoiceId,
  });
  if (error) { err++; if(err<=10) console.log("  ERR pago", invoiceId, error.message); } else ok++;
};
for (const i of toPayFull) await applyOne(i.account_id, Number(i.balance), HOY, `${NOTE} — saldo liquidado`, i.id);
for (const x of toPayPartial) await applyOne(x.inv.account_id, x.pay, HOY, `${NOTE} — abono parcial`, x.inv.id);
console.log(`Pagos aplicados: ${ok} · errores: ${err}`);

// 3) verificación
const after = await pageAll("invoices","balance, status", (q)=>q.neq("status","cancelada").gt("balance",0));
const afterTotal = after.reduce((s,i)=>s+Number(i.balance||0),0);
console.log(`\nSaldo CRM tras conciliar: ${money(afterTotal)} (archivo: ${money(fileTotal)})`);
