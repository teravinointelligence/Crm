// Parseo de estados de cuenta en CSV / XLSX → transacciones.
// (Los PDF se extraen con Claude en lib/anthropic.ts — aquí solo tablas.)
//
// Es tolerante a formatos: detecta columnas por encabezado y soporta tanto un
// solo campo de importe con signo como columnas separadas de cargo/abono.
// Maneja formato MXN ($ , .) y negativos con paréntesis.

import * as XLSX from "xlsx";
import type { BankParseResult, BankTxnKind, BankTxnParsed } from "./types";

function normKey(k: string): string {
  return String(k).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
}

/** Parsea un número en formato MXN: "$1,234.56", "(123.00)" → -123. */
function parseMoney(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return v;
  let s = String(v).trim();
  if (!s) return null;
  const neg = /^\(.*\)$/.test(s) || /-\s*$/.test(s);
  s = s.replace(/[()$\s]/g, "").replace(/,/g, "").replace(/-$/, "");
  const n = Number(s);
  if (Number.isNaN(n)) return null;
  return neg && n > 0 ? -n : n;
}

const ESP_MONTHS: Record<string, number> = {
  ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6,
  jul: 7, ago: 8, sep: 9, oct: 10, nov: 11, dic: 12,
};

function parseDate(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "number" && v > 0 && XLSX.SSF) {
    const d = XLSX.SSF.parse_date_code(v);
    if (d) return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
  }
  const s = String(v).trim();
  if (!s) return null;
  const esp = /^(\d{1,2})[/-]([a-zA-Z]{3,})[/-](\d{2,4})$/.exec(s);
  if (esp) {
    const mo = ESP_MONTHS[esp[2].toLowerCase().slice(0, 3)];
    if (mo) {
      const y = esp[3].length === 2 ? `20${esp[3]}` : esp[3];
      return `${y}-${String(mo).padStart(2, "0")}-${esp[1].padStart(2, "0")}`;
    }
  }
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  const dmy = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/.exec(s);
  if (dmy) {
    const y = dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3];
    return `${y}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

// Sinónimos de encabezados que vemos en bancos mexicanos.
const COL = {
  date: ["fecha", "fecha operacion", "fecha de operacion", "fecha mov", "f. operacion", "fecha movimiento"],
  desc: ["concepto", "descripcion", "detalle", "descripcion del movimiento", "movimiento", "referencia descriptiva"],
  ref: ["referencia", "folio", "no. referencia", "referencia numerica", "clave de rastreo", "codigo"],
  abono: ["abono", "abonos", "deposito", "depositos", "ingreso", "ingresos", "credito"],
  cargo: ["cargo", "cargos", "retiro", "retiros", "egreso", "egresos", "debito"],
  amount: ["importe", "monto", "importe del movimiento", "monto del movimiento"],
  type: ["tipo", "naturaleza", "tipo de movimiento"],
};

function findCol(headers: string[], names: string[]): string | null {
  for (const h of headers) {
    const nk = normKey(h);
    if (names.some((n) => nk === n || nk.includes(n))) return h;
  }
  return null;
}

/** Lee el primer sheet como filas-objeto, detectando la fila de encabezados. */
function readRows(buf: ArrayBuffer): Record<string, unknown>[] {
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return [];
  // Matriz cruda para localizar la fila de encabezados (la que tenga "fecha").
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false });
  let headerRow = 0;
  for (let i = 0; i < Math.min(matrix.length, 25); i++) {
    const cells = (matrix[i] ?? []).map((c) => normKey(String(c ?? "")));
    if (cells.some((c) => c.includes("fecha")) &&
        cells.some((c) => COL.amount.includes(c) || COL.abono.some((a) => c.includes(a)) || c.includes("concepto") || c.includes("descripcion"))) {
      headerRow = i;
      break;
    }
  }
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
    range: headerRow,
    defval: null,
    raw: false,
  });
}

export function parseBankTable(buf: ArrayBuffer): BankParseResult {
  const rows = readRows(buf);
  const errors: { row: number; message: string }[] = [];
  const out: BankTxnParsed[] = [];
  if (!rows.length) {
    return { rows: out, errors: [{ row: 0, message: "No se encontraron filas en el archivo." }], source: "table" };
  }

  const headers = Object.keys(rows[0]);
  const cDate = findCol(headers, COL.date);
  const cDesc = findCol(headers, COL.desc);
  const cRef = findCol(headers, COL.ref);
  const cAbono = findCol(headers, COL.abono);
  const cCargo = findCol(headers, COL.cargo);
  const cAmount = findCol(headers, COL.amount);
  const cType = findCol(headers, COL.type);

  if (!cDate && !cDesc) {
    return {
      rows: out,
      errors: [{ row: 0, message: "No reconocí columnas (se esperaba al menos Fecha y Concepto)." }],
      source: "table",
    };
  }

  rows.forEach((r, i) => {
    const rowNo = i + 1;
    const description = String((cDesc ? r[cDesc] : "") ?? "").trim();
    const reference = cRef ? (String(r[cRef] ?? "").trim() || null) : null;
    const txn_date = cDate ? parseDate(r[cDate]) : null;

    let amount: number | null = null;
    let kind: BankTxnKind | null = null;

    if (cAbono || cCargo) {
      const ab = cAbono ? parseMoney(r[cAbono]) : null;
      const ca = cCargo ? parseMoney(r[cCargo]) : null;
      if (ab && Math.abs(ab) > 0) { amount = Math.abs(ab); kind = "abono"; }
      else if (ca && Math.abs(ca) > 0) { amount = Math.abs(ca); kind = "cargo"; }
    }
    if (amount == null && cAmount) {
      const m = parseMoney(r[cAmount]);
      if (m != null && m !== 0) {
        amount = Math.abs(m);
        // signo por columna tipo o por el signo del importe
        const t = cType ? normKey(String(r[cType] ?? "")) : "";
        if (t.includes("abono") || t.includes("deposito") || t.includes("credito")) kind = "abono";
        else if (t.includes("cargo") || t.includes("retiro") || t.includes("debito")) kind = "cargo";
        else kind = m > 0 ? "abono" : "cargo";
      }
    }

    // Filas sin importe (saldos, encabezados sueltos) se omiten en silencio.
    if (amount == null || kind == null) return;
    if (!description && !reference) {
      errors.push({ row: rowNo, message: "Movimiento sin concepto ni referencia (se omitió)." });
      return;
    }

    out.push({
      txn_date,
      description: description || "(sin concepto)",
      reference,
      amount,
      kind,
      row_index: out.length,
    });
  });

  if (!out.length && !errors.length) {
    errors.push({ row: 0, message: "No se detectaron movimientos con importe." });
  }
  return { rows: out, errors, source: "table" };
}

/** Detecta el tipo de archivo por nombre/MIME. */
export function detectFileKind(name: string, type?: string): "pdf" | "csv" | "xlsx" | null {
  const n = name.toLowerCase();
  if (n.endsWith(".pdf") || type === "application/pdf") return "pdf";
  if (n.endsWith(".csv") || type === "text/csv") return "csv";
  if (n.endsWith(".xlsx") || n.endsWith(".xls") ||
      type?.includes("spreadsheet") || type?.includes("excel")) return "xlsx";
  return null;
}
