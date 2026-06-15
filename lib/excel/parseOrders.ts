import * as XLSX from "xlsx";
import type { ParseResult } from "./parseCartera";

// Importador de pedidos por cliente (solo encabezado): una fila por pedido.
// Columnas: Folio, Fecha, Total (requeridas); Tipo, Estatus, Subtotal, IVA,
// Notas (opcionales). Detecta la fila de encabezado escaneando (tolera banners
// de título/metadatos arriba del header, como los reportes formateados).

export type OrderRowParsed = {
  order_number: string;
  order_date: string;
  subtotal: number | null;
  iva: number | null;
  total: number;
  order_type: "pedido" | "cotizacion" | null;
  status: string | null;
  notes: string | null;
};

function normKey(k: unknown) {
  return String(k ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[._-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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

const FOLIO_ALIASES = ["folio", "folio pedido", "numero", "no", "no pedido", "pedido", "factura", "order number", "orden"];
const FECHA_ALIASES = ["fecha", "fecha pedido", "fecha emision", "emision", "order date"];
const TOTAL_ALIASES = ["total", "importe", "monto", "total pedido"];

function findCol(cells: string[], aliases: string[]): number {
  for (const a of aliases) {
    const i = cells.findIndex((c) => c === a || c.split(" ").includes(a));
    if (i !== -1) return i;
  }
  return -1;
}

function normStatus(v: unknown): string | null {
  const s = normKey(v).replace(/\s+/g, "");
  const allowed = ["borrador", "enviada", "aceptada", "rechazada", "facturada", "entregada", "cancelada"];
  return allowed.includes(s) ? s : null;
}

function normType(v: unknown): "pedido" | "cotizacion" | null {
  const s = normKey(v);
  if (s.startsWith("pedido")) return "pedido";
  if (s.startsWith("cotiz")) return "cotizacion";
  return null;
}

export async function parseOrdersExcel(buf: ArrayBuffer): Promise<ParseResult<OrderRowParsed>> {
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
    raw: true,
    blankrows: false,
  });
  if (!matrix.length) {
    return { rows: [], errors: [{ row: 0, message: "El archivo está vacío o no tiene una hoja válida." }] };
  }

  // Busca la fila de encabezado: la primera que tenga Folio + (Fecha o Total).
  let headerIdx = -1;
  let cFolio = -1;
  let cFecha = -1;
  let cTotal = -1;
  let cTipo = -1;
  let cStatus = -1;
  let cSubtotal = -1;
  let cIva = -1;
  let cNotas = -1;
  for (let i = 0; i < matrix.length; i++) {
    const cells = matrix[i].map(normKey);
    const f = findCol(cells, FOLIO_ALIASES);
    const fe = findCol(cells, FECHA_ALIASES);
    const t = findCol(cells, TOTAL_ALIASES);
    if (f !== -1 && (fe !== -1 || t !== -1)) {
      headerIdx = i;
      cFolio = f;
      cFecha = fe;
      cTotal = t;
      cTipo = findCol(cells, ["tipo", "tipo pedido", "order type"]);
      cStatus = findCol(cells, ["estatus", "status", "estado"]);
      cSubtotal = findCol(cells, ["subtotal"]);
      cIva = findCol(cells, ["iva"]);
      cNotas = findCol(cells, ["notas", "nota", "observaciones", "comentarios"]);
      break;
    }
  }

  if (headerIdx === -1) {
    const firstRow = matrix[0].map((c) => String(c ?? "").trim()).filter(Boolean);
    return {
      rows: [],
      errors: [
        {
          row: 1,
          message: `No detecté las columnas mínimas (Folio y Total/Fecha). Primera fila leída: ${firstRow.join(" · ") || "(vacía)"}`,
        },
      ],
    };
  }

  const rows: OrderRowParsed[] = [];
  const errors: ParseResult<OrderRowParsed>["errors"] = [];
  const seen = new Set<string>();

  for (let i = headerIdx + 1; i < matrix.length; i++) {
    const row = matrix[i];
    const rowNum = i + 1;
    const folio = String(row[cFolio] ?? "").trim().replace(/\.0+$/, "");
    if (!folio || folio.includes(":")) continue; // filas de sección/etiqueta/total
    if (/^total/i.test(folio)) continue;

    const fecha = cFecha !== -1 ? parseDate(row[cFecha]) : null;
    const total = cTotal !== -1 ? parseNum(row[cTotal]) : 0;
    if (!fecha) {
      errors.push({ row: rowNum, message: `Folio ${folio}: fecha inválida o faltante` });
      continue;
    }
    if (!total || total <= 0) {
      errors.push({ row: rowNum, message: `Folio ${folio}: total inválido` });
      continue;
    }
    if (seen.has(folio)) {
      errors.push({ row: rowNum, message: `Folio ${folio}: duplicado dentro del archivo` });
      continue;
    }
    seen.add(folio);

    rows.push({
      order_number: folio,
      order_date: fecha,
      subtotal: cSubtotal !== -1 && row[cSubtotal] !== "" ? parseNum(row[cSubtotal]) : null,
      iva: cIva !== -1 && row[cIva] !== "" ? parseNum(row[cIva]) : null,
      total,
      order_type: cTipo !== -1 ? normType(row[cTipo]) : null,
      status: cStatus !== -1 ? normStatus(row[cStatus]) : null,
      notes: cNotas !== -1 ? String(row[cNotas] ?? "").trim() || null : null,
    });
  }

  if (!rows.length && !errors.length) {
    errors.push({ row: headerIdx + 1, message: "No se encontraron pedidos debajo del encabezado." });
  }

  return { rows, errors };
}
