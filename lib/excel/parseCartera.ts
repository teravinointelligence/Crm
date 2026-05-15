import * as XLSX from "xlsx";

function normKey(k: string) {
  return k.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
}

function parseNum(v: unknown): number {
  if (typeof v === "number") return v;
  const n = Number(String(v ?? "").replace(/[$,\s]/g, ""));
  return Number.isNaN(n) ? 0 : n;
}

const ESP_MONTHS: Record<string, number> = {
  ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6,
  jul: 7, ago: 8, sep: 9, oct: 10, nov: 11, dic: 12,
};

function parseDate(v: unknown): string | null {
  if (!v && v !== 0) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "number" && v > 0) {
    const d = XLSX.SSF ? XLSX.SSF.parse_date_code(v) : null;
    if (d) return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
  }
  const s = String(v).trim();
  if (!s) return null;
  // dd/MMM/yyyy (Spanish abbrev): 01/ENE/2021
  const esp = /^(\d{1,2})[/-]([a-zA-Z]{3,4})[/-](\d{2,4})$/.exec(s);
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

export type InvoiceRowParsed = {
  invoice_number: string;
  invoice_date: string;
  due_date: string | null;
  client_number: string | null;
  rfc: string | null;
  client: string | null;
  subtotal: number | null;
  iva: number | null;
  total: number;
  uuid_fiscal: string | null;
};

export type PaymentRowParsed = {
  payment_date: string;
  invoice_number: string;
  client_number: string | null;
  amount: number;
  method: string | null;
  reference: string | null;
};

export type ParseResult<T> = {
  rows: T[];
  errors: { row: number; message: string }[];
};

// Detecta el reporte CONTPAQi "Antigüedad de Saldos de Clientes Detallado"
// (filas agrupadas: "Cliente: NNN" / "Nombre: ..." / partidas / subtotales).
function looksLikeAgingReport(matrix: unknown[][]): boolean {
  for (let i = 0; i < Math.min(matrix.length, 40); i++) {
    const row = matrix[i] ?? [];
    for (const c of row) {
      const s = String(c ?? "").trim().toLowerCase();
      if (s.startsWith("antigüedad de saldos") || /^cliente\s*:/i.test(s)) return true;
    }
  }
  return false;
}

function parseAgingReport(matrix: unknown[][]): ParseResult<InvoiceRowParsed> {
  const rows: InvoiceRowParsed[] = [];
  const errors: ParseResult<InvoiceRowParsed>["errors"] = [];
  let curClientNum: string | null = null;
  let curClientName: string | null = null;

  for (let i = 0; i < matrix.length; i++) {
    const row = matrix[i] ?? [];
    const first = String(row[0] ?? "").trim();

    const cli = /^cliente\s*:\s*(\S+)/i.exec(first);
    if (cli) {
      // 001 → 1, 98.0 → 98, 0 → 0
      const raw = cli[1].replace(/\.0+$/, "");
      curClientNum = raw.replace(/^0+/, "") || "0";
      curClientName = null;
      continue;
    }
    const nom = /^nombre\s*:\s*(.+)$/i.exec(first);
    if (nom) {
      curClientName = nom[1].trim() || null;
      continue;
    }
    if (/^d[ií]as\s+de\b/i.test(first)) continue;

    const vencimiento = parseDate(row[0]);
    const fecha = parseDate(row[1]);
    const serie = String(row[2] ?? "").trim();
    const folio = String(row[3] ?? "").trim().replace(/\.0+$/, "");
    if (!vencimiento || !fecha || !folio) continue;

    const buckets = [parseNum(row[5]), parseNum(row[6]), parseNum(row[7]), parseNum(row[8])];
    const saldo = Math.round(buckets.reduce((s, n) => s + (n || 0), 0) * 100) / 100;
    if (saldo <= 0) continue;

    const invNum = serie ? `${serie}${folio}` : folio;
    const subtotal = Math.round((saldo / 1.16) * 100) / 100;
    rows.push({
      invoice_number: invNum,
      invoice_date: fecha,
      due_date: vencimiento,
      client_number: curClientNum,
      rfc: null,
      client: curClientName,
      subtotal,
      iva: Math.round((saldo - subtotal) * 100) / 100,
      total: saldo,
      uuid_fiscal: null,
    });
  }

  if (!rows.length) {
    errors.push({
      row: 0,
      message:
        "Reconocí el formato de antigüedad de saldos pero no encontré partidas con saldo. Verifica que el reporte traiga columnas de 1-15 / 16-30 / 31-45 / 46+ días.",
    });
  }
  return { rows, errors };
}

function parseFlatInvoices(buf: ArrayBuffer): ParseResult<InvoiceRowParsed> {
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]], { defval: "" });
  const rows: InvoiceRowParsed[] = [];
  const errors: ParseResult<InvoiceRowParsed>["errors"] = [];
  json.forEach((raw, i) => {
    const rowNum = i + 2;
    const m: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(raw)) m[normKey(k)] = v;
    try {
      const folio = String(m["folio"] ?? m["folio fiscal"] ?? m["factura"] ?? m["numero"] ?? "").trim();
      const fecha = parseDate(m["fecha emision"] ?? m["fecha"] ?? m["emision"]);
      const total = parseNum(m["total"]);
      if (!folio) throw new Error("Folio faltante");
      if (!fecha) throw new Error("Fecha de emisión inválida");
      if (!total || total <= 0) throw new Error("Total inválido");
      const clientNum = String(
        m["# cliente"] ?? m["num cliente"] ?? m["numero cliente"] ?? m["no cliente"] ?? m["no. cliente"] ?? m["cliente id"] ?? m["id cliente"] ?? "",
      ).trim().replace(/\.0+$/, "");
      rows.push({
        invoice_number: folio,
        invoice_date: fecha,
        due_date: parseDate(m["fecha vencimiento"] ?? m["vencimiento"]),
        client_number: clientNum || null,
        rfc: String(m["rfc"] ?? "").trim().toUpperCase() || null,
        client: String(m["cliente"] ?? m["razon social"] ?? m["nombre fiscal"] ?? m["nombre comercial"] ?? "").trim() || null,
        subtotal: m["subtotal"] ? parseNum(m["subtotal"]) : null,
        iva: m["iva"] ? parseNum(m["iva"]) : null,
        total,
        uuid_fiscal: String(m["uuid fiscal"] ?? m["uuid"] ?? "").trim() || null,
      });
    } catch (e) {
      errors.push({ row: rowNum, message: e instanceof Error ? e.message : "Error" });
    }
  });
  return { rows, errors };
}

export async function parseInvoicesExcel(buf: ArrayBuffer): Promise<ParseResult<InvoiceRowParsed>> {
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
    raw: true,
    blankrows: true,
  });
  if (looksLikeAgingReport(matrix)) return parseAgingReport(matrix);
  return parseFlatInvoices(buf);
}

export async function parsePaymentsExcel(buf: ArrayBuffer): Promise<ParseResult<PaymentRowParsed>> {
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]], { defval: "" });
  const rows: PaymentRowParsed[] = [];
  const errors: ParseResult<PaymentRowParsed>["errors"] = [];
  json.forEach((raw, i) => {
    const rowNum = i + 2;
    const m: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(raw)) m[normKey(k)] = v;
    try {
      const fecha = parseDate(m["fecha pago"] ?? m["fecha"]);
      const folio = String(m["folio factura"] ?? m["folio"] ?? m["factura"] ?? "").trim();
      const monto = parseNum(m["monto"] ?? m["importe"] ?? m["pago"]);
      if (!fecha) throw new Error("Fecha de pago inválida");
      if (!folio) throw new Error("Folio de factura faltante");
      if (!monto || monto <= 0) throw new Error("Monto inválido");
      const clientNum = String(
        m["# cliente"] ?? m["num cliente"] ?? m["numero cliente"] ?? m["no cliente"] ?? m["no. cliente"] ?? m["cliente id"] ?? m["id cliente"] ?? "",
      ).trim().replace(/\.0+$/, "");
      rows.push({
        payment_date: fecha,
        invoice_number: folio,
        client_number: clientNum || null,
        amount: monto,
        method: String(m["metodo"] ?? m["forma de pago"] ?? "").trim().toLowerCase() || null,
        reference: String(m["referencia"] ?? m["ref"] ?? "").trim() || null,
      });
    } catch (e) {
      errors.push({ row: rowNum, message: e instanceof Error ? e.message : "Error" });
    }
  });
  return { rows, errors };
}
