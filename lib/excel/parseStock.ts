import * as XLSX from "xlsx";
import type { ParseResult } from "./parseProducts";

export type StockRowParsed = { sku: string; stock_quantity: number };

function normalizeKey(k: string) {
  return k
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

function detectColumn(
  normalizedKeys: string[],
  aliases: string[],
): string | null {
  for (const a of aliases) {
    const exact = normalizedKeys.find((k) => k === a);
    if (exact) return exact;
  }
  for (const a of aliases) {
    const partial = normalizedKeys.find((k) => k === a || k.startsWith(a + " ") || k.endsWith(" " + a));
    if (partial) return partial;
  }
  for (const a of aliases) {
    const fuzzy = normalizedKeys.find((k) => k.includes(a));
    if (fuzzy) return fuzzy;
  }
  return null;
}

export async function parseStockExcel(
  buf: ArrayBuffer,
): Promise<ParseResult<StockRowParsed>> {
  const wb = XLSX.read(buf, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
    raw: true,
  });

  if (!json.length) {
    return {
      rows: [],
      errors: [{ row: 0, message: "El archivo está vacío o no tiene una hoja válida." }],
    };
  }

  const normalizedMap = new Map<string, string>();
  for (const k of Object.keys(json[0])) {
    if (!k) continue;
    normalizedMap.set(normalizeKey(k), k);
  }
  const normalizedKeys = [...normalizedMap.keys()];

  const skuKeyN = detectColumn(normalizedKeys, SKU_ALIASES);
  const stockKeyN = detectColumn(normalizedKeys, STOCK_ALIASES);

  if (!skuKeyN || !stockKeyN) {
    const missing: string[] = [];
    if (!skuKeyN) missing.push("SKU (o Clave / Código)");
    if (!stockKeyN) missing.push("Stock (o Existencia / Inventario)");
    return {
      rows: [],
      errors: [
        {
          row: 1,
          message: `No detecté las columnas: ${missing.join(", ")}. Columnas encontradas: ${[...normalizedMap.values()].join(" · ")}`,
        },
      ],
    };
  }

  const skuKey = normalizedMap.get(skuKeyN)!;
  const stockKey = normalizedMap.get(stockKeyN)!;

  const rows: StockRowParsed[] = [];
  const errors: ParseResult<StockRowParsed>["errors"] = [];

  json.forEach((raw, idx) => {
    const rowNumber = idx + 2;
    const skuVal = raw[skuKey];
    const sku =
      skuVal == null ? "" : String(skuVal).trim().replace(/\.0$/, "");
    if (!sku) {
      errors.push({ row: rowNumber, message: `SKU vacío en columna "${skuKey}"` });
      return;
    }
    const stockRaw = raw[stockKey];
    const stockNum =
      typeof stockRaw === "number"
        ? stockRaw
        : Number(String(stockRaw ?? "").replace(/[,$\s]/g, ""));
    if (Number.isNaN(stockNum) || stockNum < 0) {
      errors.push({
        row: rowNumber,
        message: `Stock inválido (${JSON.stringify(stockRaw)}) en columna "${stockKey}"`,
      });
      return;
    }
    rows.push({ sku, stock_quantity: stockNum });
  });

  return { rows, errors };
}
