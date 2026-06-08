// Parseo del catálogo de clientes (Excel) para sembrar la memoria de
// conciliación: por cada cliente identificado, derivamos sus llaves de pagador
// (BNET / RFC / firma de nombre) y lo casamos con una cuenta del CRM.

import * as XLSX from "xlsx";
import { extractBnet, extractRfc, payerSignature } from "./aliases";

export type CatalogRow = {
  num: number;
  name: string;
  rfc: string | null;
  bnet: string | null;
  clienteNum: string | null; // # cliente CONTPAQ si la nota lo trae
  firma: string;
  notes: string | null;
};

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Lee la hoja "Catálogo Clientes". El encabezado real está en la fila 4. */
export function parseCatalog(buf: ArrayBuffer): CatalogRow[] {
  const wb = XLSX.read(buf, { type: "array" });
  const ws = wb.Sheets["Catálogo Clientes"] ?? wb.Sheets[wb.SheetNames[0]];
  if (!ws) return [];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false });

  const out: CatalogRow[] = [];
  for (const r of rows) {
    const num = Number(r?.[0]);
    const name = r?.[1] != null ? String(r[1]).trim() : "";
    if (!Number.isFinite(num) || !name) continue; // saltar encabezados/secciones
    const rfcCol = r?.[5] != null ? String(r[5]) : "";
    const patron = r?.[6] != null ? String(r[6]) : "";
    const notes = r?.[10] != null ? String(r[10]).trim() : null;
    const blob = `${name} ${rfcCol} ${patron} ${notes ?? ""}`;

    const rfc = extractRfc(blob);
    const bnet = extractBnet(blob);
    // # cliente CONTPAQ embebido en notas/nombre ("Cliente 15910", "CONTPAQ 276")
    const cnMatch = /(?:cliente|contpaq)\s*(\d{2,6})/i.exec(blob);
    const clienteNum = cnMatch ? cnMatch[1] : null;
    const firma = payerSignature(name, null);

    out.push({ num, name, rfc, bnet, clienteNum, firma, notes });
  }
  return out;
}

// ---- Similitud de nombres (Dice sobre bigramas) para casar con cuentas ----
function bigrams(s: string): Set<string> {
  const t = norm(s).replace(/[^a-z0-9]/g, "");
  const set = new Set<string>();
  for (let i = 0; i < t.length - 1; i++) set.add(t.slice(i, i + 2));
  return set;
}

export function nameSimilarity(a: string, b: string): number {
  const A = bigrams(a);
  const B = bigrams(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const g of A) if (B.has(g)) inter++;
  return (2 * inter) / (A.size + B.size);
}

export type AccountLite = {
  id: string;
  business_name: string;
  fiscal_name: string | null;
  rfc: string | null;
  client_number: string | null;
};

export type CatalogMatch = CatalogRow & {
  account_id: string | null;
  account_name: string | null;
  sim: number;
  reason: string;
  status: "fuerte" | "dudoso" | "sin_cuenta";
};

/** Casa una fila del catálogo con la mejor cuenta: RFC > # cliente > nombre. */
export function matchRow(row: CatalogRow, accounts: AccountLite[]): CatalogMatch {
  // 1. RFC exacto
  if (row.rfc) {
    const byRfc = accounts.find((a) => a.rfc && a.rfc.toUpperCase() === row.rfc);
    if (byRfc) return done(row, byRfc, 1, "RFC exacto", "fuerte");
  }
  // 2. # cliente CONTPAQ
  if (row.clienteNum) {
    const byCn = accounts.find((a) => a.client_number && a.client_number.replace(/^0+/, "") === row.clienteNum!.replace(/^0+/, ""));
    if (byCn) return done(row, byCn, 1, `# cliente ${row.clienteNum}`, "fuerte");
  }
  // 3. Similitud de nombre (contra business_name y fiscal_name)
  let best: AccountLite | null = null;
  let bestSim = 0;
  for (const a of accounts) {
    const sim = Math.max(nameSimilarity(row.name, a.business_name), a.fiscal_name ? nameSimilarity(row.name, a.fiscal_name) : 0);
    if (sim > bestSim) { bestSim = sim; best = a; }
  }
  if (best && bestSim >= 0.55) return done(row, best, bestSim, "Nombre muy parecido", "fuerte");
  if (best && bestSim >= 0.35) return done(row, best, bestSim, "Nombre parecido (revisar)", "dudoso");
  return { ...row, account_id: null, account_name: null, sim: bestSim, reason: "Sin cuenta clara en el CRM", status: "sin_cuenta" };
}

function done(row: CatalogRow, a: AccountLite, sim: number, reason: string, status: CatalogMatch["status"]): CatalogMatch {
  return { ...row, account_id: a.id, account_name: a.business_name, sim, reason, status };
}
