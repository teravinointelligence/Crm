// Conciliación masiva de cartera contra un reporte CONTPAQi de "Antigüedad de
// Saldos Detallado". Regla: las facturas que aparecen en el reporte siguen
// abiertas (con ese saldo); las que NO aparecen ya se pagaron.
//
//   node scripts/reconciliar-cartera.mjs "<archivo.xls>"            → ANÁLISIS (no escribe)
//   node scripts/reconciliar-cartera.mjs "<archivo.xls>" --apply    → APLICA pagos
//
// Replica la lógica de aging de lib/excel/parseCartera.ts para que los folios
// casen idénticos a como se importaron (raw:true → folio numérico sin comas).

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import * as XLSX from "xlsx";

const FILE = process.argv[2];
const APPLY = process.argv.includes("--apply");
if (!FILE) throw new Error("Uso: node scripts/reconciliar-cartera.mjs <archivo.xls> [--apply]");

// ---------- parser aging (igual que parseCartera.ts) ----------
const ESP = { ene:1,feb:2,mar:3,abr:4,may:5,jun:6,jul:7,ago:8,sep:9,oct:10,nov:11,dic:12 };
function parseDate(v) {
  if (v == null || v === "") return null;
  const s = String(v).trim();
  let m = /^(\d{1,2})[/-]([a-zA-Z]{3,4})[/-](\d{2,4})$/.exec(s);
  if (m) { const mo = ESP[m[2].toLowerCase().slice(0,3)]; if (mo) return `${m[3].length===2?"20"+m[3]:m[3]}-${String(mo).padStart(2,"0")}-${m[1].padStart(2,"0")}`; }
  m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s); if (m) return `${m[1]}-${m[2].padStart(2,"0")}-${m[3].padStart(2,"0")}`;
  m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/.exec(s); if (m) return `${m[3].length===2?"20"+m[3]:m[3]}-${m[2].padStart(2,"0")}-${m[1].padStart(2,"0")}`;
  return null;
}
function parseNum(v){ if(typeof v==="number")return v; const n=Number(String(v??"").replace(/[$,\s]/g,"")); return Number.isNaN(n)?0:n; }
function normCli(v){ const s=String(v??"").trim().replace(/\.0+$/,""); if(!s)return null; const st=s.replace(/^0+/,""); return st||"0"; }

const wb = XLSX.read(readFileSync(FILE), { type: "buffer" });
const matrix = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header:1, defval:"", raw:true, blankrows:true });

const fileOpen = new Map(); // invoice_number -> { saldo, clientNum, clientName }
const clientsInFile = new Map(); // clientNum -> clientName
let curNum=null, curName=null;
for (const row of matrix) {
  const first = String(row[0] ?? "").trim();
  let m = /^cliente\s*:\s*(\S+)/i.exec(first);
  if (m) { curNum = normCli(m[1]); curName=null; if(curNum) clientsInFile.set(curNum, null); continue; }
  m = /^nombre\s*:\s*(.+)$/i.exec(first);
  if (m) { curName = m[1].trim()||null; if(curNum) clientsInFile.set(curNum, curName); continue; }
  if (/^d[ií]as\s+de\b/i.test(first)) continue;
  const venc = parseDate(row[0]); const fecha = parseDate(row[1]);
  const serie = String(row[2]??"").trim(); const folio = String(row[3]??"").trim().replace(/\.0+$/,"");
  if (!venc || !fecha || !folio) continue;
  const saldo = Math.round([parseNum(row[5]),parseNum(row[6]),parseNum(row[7]),parseNum(row[8])].reduce((s,n)=>s+(n||0),0)*100)/100;
  if (saldo <= 0) continue;
  const inv = serie ? `${serie}${folio}` : folio;
  const prev = fileOpen.get(inv);
  fileOpen.set(inv, { saldo: (prev?.saldo||0)+saldo, clientNum: curNum, clientName: curName });
}

const fileTotal = [...fileOpen.values()].reduce((s,x)=>s+x.saldo,0);
console.log(`\n=== ARCHIVO (reporte) ===`);
console.log(`Clientes en el reporte: ${clientsInFile.size}`);
console.log(`Facturas abiertas en el reporte: ${fileOpen.size}`);
console.log(`Saldo total del reporte: $${fileTotal.toLocaleString("es-MX",{minimumFractionDigits:2})}`);

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

// cuentas (id -> {client_number, business_name})
const acct = new Map();
for (let from=0;;from+=1000){
  const { data, error } = await db.from("accounts").select("id, client_number, business_name").range(from, from+999);
  if(error) throw error;
  for(const a of data) acct.set(a.id, a);
  if(data.length<1000) break;
}
// facturas abiertas del CRM
const crmOpen = [];
for (let from=0;;from+=1000){
  const { data, error } = await db.from("invoices")
    .select("id, invoice_number, account_id, balance, due_date, invoice_date")
    .neq("status","cancelada").gt("balance",0).range(from, from+999);
  if(error) throw error;
  crmOpen.push(...data);
  if(data.length<1000) break;
}
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
// folios del reporte que el CRM no tiene
const crmFolios = new Set(crmOpen.map(i=>i.invoice_number));
const fileNotInCrm = [...fileOpen.entries()].filter(([inv])=>!crmFolios.has(inv));
const fileNotInCrmTotal = fileNotInCrm.reduce((s,[,x])=>s+x.saldo,0);

const sum = (arr,f)=>arr.reduce((s,x)=>s+f(x),0);
const fullTotal = sum(toPayFull,i=>Number(i.balance||0));
const partialTotal = sum(toPayPartial,x=>x.pay);
const keepTotal = sum(keepOpen,i=>Number(i.balance||0));

// cuentas que quedarían en CERO (todas sus abiertas se pagan)
const byAcct = new Map();
for (const i of crmOpen){ const a=(byAcct.get(i.account_id)||{open:0,paid:0}); a.open++; byAcct.set(i.account_id,a); }
for (const i of toPayFull){ byAcct.get(i.account_id).paid++; }
const zeroed=[];
for (const [id,a] of byAcct){ if(a.paid===a.open){ const ac=acct.get(id)||{}; const monto=sum(crmOpen.filter(i=>i.account_id===id),i=>Number(i.balance||0)); zeroed.push({cli:ac.client_number,nom:ac.business_name,monto}); } }
zeroed.sort((x,y)=>y.monto-x.monto);

console.log(`\n=== CRM (hoy) ===`);
console.log(`Facturas abiertas: ${crmOpen.length} · Saldo: $${crmTotal.toLocaleString("es-MX",{minimumFractionDigits:2})}`);
console.log(`\n=== PLAN DE CONCILIACIÓN ===`);
console.log(`Quedan ABIERTAS (folio en reporte, mismo saldo): ${keepOpen.length} · $${keepTotal.toLocaleString("es-MX",{minimumFractionDigits:2})}`);
console.log(`PAGO PARCIAL (folio en reporte, saldo menor):    ${toPayPartial.length} · abono $${partialTotal.toLocaleString("es-MX",{minimumFractionDigits:2})}`);
console.log(`MARCAR PAGADAS (folio NO está en reporte):       ${toPayFull.length} · $${fullTotal.toLocaleString("es-MX",{minimumFractionDigits:2})}`);
console.log(`\nSaldo CRM proyectado tras conciliar: $${(crmTotal-fullTotal-partialTotal).toLocaleString("es-MX",{minimumFractionDigits:2})}`);
console.log(`(debe ≈ saldo del reporte $${fileTotal.toLocaleString("es-MX",{minimumFractionDigits:2})})`);
console.log(`\n=== ALERTAS / REVISAR ===`);
console.log(`Folios del reporte que el CRM NO tiene (faltan cargar): ${fileNotInCrm.length} · $${fileNotInCrmTotal.toLocaleString("es-MX",{minimumFractionDigits:2})}`);
console.log(`Folios donde el reporte dice MÁS saldo que el CRM (raro): ${over.length}`);
console.log(`Cuentas que quedarían en CERO (todas pagadas): ${zeroed.length}`);
console.log(`  — Top 15 por monto que se daría por pagado:`);
zeroed.slice(0,15).forEach(z=>console.log(`     #${z.cli??"?"} ${z.nom??""} · $${z.monto.toLocaleString("es-MX",{minimumFractionDigits:2})}`));

if (!APPLY) {
  console.log(`\n*** MODO ANÁLISIS — no se escribió nada. Corre con --apply para aplicar. ***\n`);
  process.exit(0);
}

// ---------- APLICAR ----------
console.log(`\n*** APLICANDO pagos… ***`);
let ok=0, err=0;
const applyOne = async (accountId, amount, date, note, invoiceId) => {
  const { error } = await db.rpc("apply_payment", {
    p_account_id: accountId, p_amount: amount, p_payment_date: date,
    p_method: "otro", p_reference: null, p_notes: note, p_invoice_id: invoiceId,
  });
  if (error) { err++; if(err<=10) console.log("  ERR", invoiceId, error.message); } else ok++;
};
const NOTE = "Conciliación cartera 09/jun/2026 (CONTPAQi) — saldo liquidado";
// full
for (const i of toPayFull) await applyOne(i.account_id, Number(i.balance), i.due_date||i.invoice_date, NOTE, i.id);
// partial
for (const x of toPayPartial) await applyOne(x.inv.account_id, x.pay, x.inv.due_date||x.inv.invoice_date, NOTE+" (parcial)", x.inv.id);
console.log(`\nListo. Pagos aplicados: ${ok} · errores: ${err}`);
