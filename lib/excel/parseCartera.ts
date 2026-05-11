import * as XLSX from "xlsx";

function normKey(k: string) {
  return k.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
}

function parseNum(v: unknown): number {
  if (typeof v === "number") return v;
  const n = Number(String(v ?? "").replace(/[$,\s]/g, ""));
  return Number.isNaN(n) ? 0 : n;
}

function parseDate(v: unknown): string | null {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "number") {
    // Excel serial date
    const d = XLSX.SSF ? XLSX.SSF.parse_date_code(v) : null;
    if (d) return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
  }
  const s = String(v).trim();
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
  amount: number;
  method: string | null;
  reference: string | null;
};

export type ParseResult<T> = {
  rows: T[];
  errors: { row: number; message: string }[];
};

export async function parseInvoicesExcel(buf: ArrayBuffer): Promise<ParseResult<InvoiceRowParsed>> {
  const wb = XLSX.read(buf, { type: "array" });
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
      rows.push({
        invoice_number: folio,
        invoice_date: fecha,
        due_date: parseDate(m["fecha vencimiento"] ?? m["vencimiento"]),
        rfc: String(m["rfc"] ?? "").trim().toUpperCase() || null,
        client: String(m["cliente"] ?? m["razon social"] ?? m["nombre fiscal"] ?? "").trim() || null,
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

export async function parsePaymentsExcel(buf: ArrayBuffer): Promise<ParseResult<PaymentRowParsed>> {
  const wb = XLSX.read(buf, { type: "array" });
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
      rows.push({
        payment_date: fecha,
        invoice_number: folio,
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
