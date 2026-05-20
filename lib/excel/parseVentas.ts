import * as XLSX from "xlsx";
import { normalizeClientNumber } from "./parseCartera";

const ESP_MONTHS: Record<string, number> = {
  ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6,
  jul: 7, ago: 8, sep: 9, oct: 10, nov: 11, dic: 12,
};

function parseNum(v: unknown): number {
  if (typeof v === "number") return v;
  const n = Number(String(v ?? "").replace(/[$,\s]/g, ""));
  return Number.isNaN(n) ? 0 : n;
}

function norm(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
}

export type VentaRowParsed = {
  vendedor_excel: string | null;
  client_number: string | null;
  client_name: string | null;
  venta_bruta: number;
  neto: number;
  descuento: number;
  neto_desc: number;
};

export type VentasParseResult = {
  rows: VentaRowParsed[];
  errors: { row: number; message: string }[];
  /** Periodo detectado del título (primer día del mes, YYYY-MM-DD) o null. */
  periodGuess: string | null;
};

// ---- Reporte crudo CONTPAQ "Reporte de Ventas por Cliente" (con producto) ----

export type VentaItemParsed = {
  codigo: string | null;
  producto_nombre: string;
  cantidad: number;
  neto: number;
  descuento: number;
  neto_desc: number;
  impuesto: number;
  total: number;
};

export type VentaClienteParsed = {
  client_number: string | null;
  client_name: string | null;
  items: VentaItemParsed[];
  venta_bruta: number; // suma de items.total
  neto: number;
  descuento: number;
  neto_desc: number;
};

export type VentasContpaqResult = {
  clientes: VentaClienteParsed[];
  errors: { row: number; message: string }[];
  periodGuess: string | null;
};

/** Intenta extraer "01/ABR/2026" o "Abril 2026" del texto del encabezado. */
function detectPeriod(matrix: unknown[][]): string | null {
  const text = matrix
    .slice(0, 4)
    .flat()
    .map((c) => String(c ?? ""))
    .join(" ");
  // dd/MMM/yyyy
  const esp = /(\d{1,2})[/-]([a-zA-Z]{3,4})[/-](\d{4})/.exec(text);
  if (esp) {
    const mo = ESP_MONTHS[esp[2].toLowerCase().slice(0, 3)];
    if (mo) return `${esp[3]}-${String(mo).padStart(2, "0")}-01`;
  }
  // "Abril 2026" / "abril de 2026"
  const mesNombre: Record<string, number> = {
    enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
    julio: 7, agosto: 8, septiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
  };
  const nm = /(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\s+(?:de\s+)?(\d{4})/i.exec(text);
  if (nm) {
    const mo = mesNombre[nm[1].toLowerCase()];
    if (mo) return `${nm[2]}-${String(mo).padStart(2, "0")}-01`;
  }
  return null;
}

/**
 * Parsea el reporte "Ventas por Vendedor" de TERAVINO. Lee la hoja
 * "Detalle por Cliente" (una fila por cliente, con # cliente CONTPAQ).
 * Si no la encuentra, usa la primera hoja con esa estructura de columnas.
 */
export async function parseVentasExcel(buf: ArrayBuffer): Promise<VentasParseResult> {
  const wb = XLSX.read(buf, { type: "array", cellDates: true });

  // Preferimos la hoja de detalle por cliente.
  const detalleName =
    wb.SheetNames.find((n) => norm(n).includes("detalle")) ?? wb.SheetNames[0];
  const sheet = wb.Sheets[detalleName];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
    blankrows: true,
  });

  const periodGuess = detectPeriod(matrix);

  // Localiza la fila de encabezados (la que tiene "# Cliente" y "Vendedor").
  let headerIdx = -1;
  for (let i = 0; i < Math.min(matrix.length, 12); i++) {
    const cells = (matrix[i] ?? []).map((c) => norm(String(c ?? "")));
    const hasCliente = cells.some((c) => c.includes("# cliente") || c === "cliente" || c.includes("no cliente"));
    const hasVendedor = cells.some((c) => c === "vendedor");
    if (hasCliente && hasVendedor) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) {
    return {
      rows: [],
      errors: [{ row: 0, message: 'No encontré la tabla de detalle (encabezados "Vendedor" y "# Cliente"). Verifica que el Excel tenga la hoja "Detalle por Cliente".' }],
      periodGuess,
    };
  }

  // Mapea columnas por nombre normalizado.
  const header = (matrix[headerIdx] ?? []).map((c) => norm(String(c ?? "")));
  const col = (...candidates: string[]) =>
    header.findIndex((h) => candidates.some((cand) => h === cand || h.includes(cand)));

  const cVendedor = col("vendedor");
  const cCliente = col("# cliente", "no cliente", "numero cliente", "cliente");
  const cNombre = col("nombre comercial", "nombre", "cliente nombre");
  const cBruta = col("venta bruta", "bruta", "total");
  const cNeto = col("neto-desc", "neto desc"); // tentativo, ajustamos abajo
  const cNetoPlano = header.findIndex((h) => h === "neto");
  const cDescuento = col("descuento");
  const cNetoDesc = header.findIndex((h) => h.includes("neto-desc") || h.includes("neto desc") || h.includes("netodesc"));

  const rows: VentaRowParsed[] = [];
  const errors: VentasParseResult["errors"] = [];

  for (let i = headerIdx + 1; i < matrix.length; i++) {
    const r = matrix[i] ?? [];
    const vendedor = String(r[cVendedor] ?? "").trim();
    const clienteRaw = cCliente >= 0 ? r[cCliente] : "";
    const clientNum = normalizeClientNumber(clienteRaw);
    const nombre = cNombre >= 0 ? String(r[cNombre] ?? "").trim() : "";

    // Saltar filas de notas/totales/vacías.
    if (!vendedor && !clientNum && !nombre) continue;
    const vNorm = norm(vendedor);
    if (vNorm.startsWith("total") || vNorm.startsWith("nota") || vNorm.startsWith("•")) continue;
    if (!clientNum) {
      // Fila sin # cliente — probablemente nota o subtotal; la ignoramos en silencio
      // salvo que traiga un monto, en cuyo caso la reportamos.
      const maybeMonto = parseNum(cBruta >= 0 ? r[cBruta] : 0);
      if (maybeMonto > 0) {
        errors.push({ row: i + 1, message: `Fila con venta (${nombre || vendedor || "?"}) sin # cliente — no se puede asignar.` });
      }
      continue;
    }

    const venta_bruta = parseNum(cBruta >= 0 ? r[cBruta] : 0);
    const neto = parseNum(cNetoPlano >= 0 ? r[cNetoPlano] : (cNeto >= 0 ? r[cNeto] : 0));
    const descuento = parseNum(cDescuento >= 0 ? r[cDescuento] : 0);
    const neto_desc = parseNum(cNetoDesc >= 0 ? r[cNetoDesc] : 0);

    rows.push({
      vendedor_excel: vendedor || null,
      client_number: clientNum,
      client_name: nombre || null,
      venta_bruta,
      neto,
      descuento,
      neto_desc,
    });
  }

  if (!rows.length) {
    errors.push({ row: 0, message: "No encontré filas de ventas con # cliente en la hoja de detalle." });
  }

  return { rows, errors, periodGuess };
}

/**
 * Detecta si el workbook es el reporte crudo de CONTPAQ "Reporte de Ventas por
 * Cliente" (hoja "Reporte de Ventas", agrupado por "Cliente:").
 */
export function isContpaqVentas(buf: ArrayBuffer): boolean {
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const m = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", blankrows: true });
  for (let i = 0; i < Math.min(m.length, 12); i++) {
    const joined = (m[i] ?? []).map((c) => norm(String(c ?? ""))).join(" ");
    if (joined.includes("reporte de ventas")) return true;
    if ((m[i] ?? []).some((c) => norm(String(c ?? "")) === "cliente:")) return true;
  }
  return false;
}

/**
 * Parsea el reporte crudo de CONTPAQ. Agrupa por bloques "Cliente: <num>" /
 * "Nombre: <name>" con líneas de producto, y un "Total Cliente" al cierre.
 * Devuelve clientes con su detalle de productos.
 */
export async function parseVentasContpaq(buf: ArrayBuffer): Promise<VentasContpaqResult> {
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const m = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", blankrows: true });
  const periodGuess = detectPeriod(m);

  const clientes: VentaClienteParsed[] = [];
  const errors: VentasContpaqResult["errors"] = [];
  let cur: VentaClienteParsed | null = null;

  const pushCur = () => {
    if (cur && cur.items.length) {
      cur.venta_bruta = Math.round(cur.items.reduce((s, it) => s + it.total, 0) * 100) / 100;
      cur.neto = Math.round(cur.items.reduce((s, it) => s + it.neto, 0) * 100) / 100;
      cur.descuento = Math.round(cur.items.reduce((s, it) => s + it.descuento, 0) * 100) / 100;
      cur.neto_desc = Math.round(cur.items.reduce((s, it) => s + it.neto_desc, 0) * 100) / 100;
      clientes.push(cur);
    }
    cur = null;
  };

  for (let i = 0; i < m.length; i++) {
    const r = m[i] ?? [];
    const c0 = String(r[0] ?? "").trim();
    const c1 = String(r[1] ?? "").trim();

    if (c0 === "Cliente:") {
      pushCur();
      cur = {
        client_number: normalizeClientNumber(r[1]),
        client_name: null,
        items: [],
        venta_bruta: 0,
        neto: 0,
        descuento: 0,
        neto_desc: 0,
      };
      continue;
    }
    if (c0 === "Nombre:") {
      if (cur) cur.client_name = c1 || null;
      continue;
    }
    // Fila de cierre de cliente / total general → ignorar y cerrar bloque.
    if (c1 === "Total Cliente") { continue; }
    if (c1 === "Total General" || c0.includes("====")) { continue; }
    // Encabezados / vacías
    if (!c0 || norm(c0) === "codigo" || norm(c0) === "contpaq i" || norm(c0).startsWith("moneda")) continue;

    // Línea de producto: requiere código y nombre.
    if (!cur) continue;
    const codigo = c0;
    const nombre = c1;
    if (!nombre) continue;
    const cantidad = parseNum(r[2]);
    const neto = parseNum(r[4]);
    const descuento = parseNum(r[5]);
    const neto_desc = parseNum(r[6]);
    const impuesto = parseNum(r[7]);
    const total = parseNum(r[8]);
    if (total === 0 && cantidad === 0) continue;
    cur.items.push({ codigo: codigo || null, producto_nombre: nombre, cantidad, neto, descuento, neto_desc, impuesto, total });
  }
  pushCur();

  if (!clientes.length) {
    errors.push({ row: 0, message: "No encontré clientes con detalle de producto en el reporte CONTPAQ." });
  }
  return { clientes, errors, periodGuess };
}
