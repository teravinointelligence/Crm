import * as XLSX from "xlsx";
import type { ParseResult } from "./parseProducts";

export type StockRowParsed = { sku: string; stock_quantity: number };

function normalizeKey(k: unknown) {
  return String(k ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[._-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const SKU_ALIASES = [
  "sku",
  "clave",
  "codigo",
  "codigo producto",
  "codigo sat",
  "cod",
  "cve",
  "articulo",
  "item",
  "no",
  "no producto",
  "id",
  "id producto",
];

const STOCK_ALIASES = [
  "stock",
  "stock quantity",
  "stock_quantity",
  "existencia",
  "existencias",
  "exist",
  "inventario",
  "inv",
  "cantidad",
  "cant",
  "disponible",
  "unidades",
  "en stock",
  "cantidad disponible",
];

// ¿La etiqueta normalizada `cell` empata el alias? Match por palabra: igual,
// token exacto, o el alias multipalabra delimitado por inicio/espacio/fin. NO
// usa subcadena suelta (evita que "id" empate dentro de "unidades", etc.).
function cellMatches(cell: string, alias: string): boolean {
  if (!cell) return false;
  if (cell === alias) return true;
  if (cell.split(" ").includes(alias)) return true;
  return (
    cell.startsWith(alias + " ") ||
    cell.endsWith(" " + alias) ||
    cell.includes(" " + alias + " ")
  );
}

// Índice de la columna que mejor empata con la lista de alias (índice =
// columna), respetando el orden de prioridad de los alias.
function detectColumnIndex(normalizedCells: string[], aliases: string[]): number {
  for (const a of aliases) {
    const i = normalizedCells.findIndex((k) => cellMatches(k, a));
    if (i !== -1) return i;
  }
  return -1;
}

// Convierte una existencia cruda a número. Devuelve null cuando la celda está
// vacía/espacios (fila de sección o etiqueta, p.ej. "Almacén:" en el reporte
// de CONTPAQ) para que se omita en silencio en vez de cargar un 0 falso.
function toStock(raw: unknown): number | null | "invalid" {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : "invalid";
  const s = String(raw ?? "").replace(/[,$\s]/g, "");
  if (s === "") return null;
  const n = Number(s);
  return Number.isNaN(n) ? "invalid" : n;
}

export async function parseStockExcel(
  buf: ArrayBuffer,
): Promise<ParseResult<StockRowParsed>> {
  const wb = XLSX.read(buf, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  // Array de arreglos: así toleramos las filas de título del reporte de CONTPAQ
  // (logo, fechas, "EN UNIDADES"…) que van ANTES del encabezado real.
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: null,
    raw: true,
    blankrows: false,
  });

  if (!matrix.length) {
    return {
      rows: [],
      errors: [{ row: 0, message: "El archivo está vacío o no tiene una hoja válida." }],
    };
  }

  // Busca la fila de encabezado: la primera que tenga a la vez una columna de
  // SKU/código y una de existencia. (En un Excel limpio es la fila 1.)
  let headerIdx = -1;
  let skuCol = -1;
  let stockCol = -1;
  for (let i = 0; i < matrix.length; i++) {
    const cells = matrix[i].map(normalizeKey);
    const s = detectColumnIndex(cells, SKU_ALIASES);
    const k = detectColumnIndex(cells, STOCK_ALIASES);
    if (s !== -1 && k !== -1) {
      headerIdx = i;
      skuCol = s;
      stockCol = k;
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
          message: `No detecté las columnas SKU (o Clave / Código) y Existencia (o Stock / Inventario). Primera fila leída: ${firstRow.join(" · ") || "(vacía)"}`,
        },
      ],
    };
  }

  const rows: StockRowParsed[] = [];
  const errors: ParseResult<StockRowParsed>["errors"] = [];

  for (let i = headerIdx + 1; i < matrix.length; i++) {
    const rowNumber = i + 1; // 1-based para el usuario
    const row = matrix[i];
    const sku = String(row[skuCol] ?? "").trim().replace(/\.0$/, "");
    if (!sku || sku.includes(":")) continue; // filas de sección/etiqueta

    const stock = toStock(row[stockCol]);
    if (stock === null) continue; // existencia vacía → fila no-producto, se omite
    if (stock === "invalid" || stock < 0) {
      errors.push({
        row: rowNumber,
        message: `Existencia inválida (${JSON.stringify(row[stockCol])}) para "${sku}"`,
      });
      continue;
    }
    rows.push({ sku, stock_quantity: stock });
  }

  if (!rows.length && !errors.length) {
    errors.push({ row: headerIdx + 1, message: "No se encontraron filas de producto debajo del encabezado." });
  }

  return { rows, errors };
}
