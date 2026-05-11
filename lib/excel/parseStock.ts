import * as XLSX from "xlsx";
import type { ParseResult } from "./parseProducts";

export type StockRowParsed = { sku: string; stock_quantity: number };

function normalizeKey(k: string) {
  return k
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

export async function parseStockExcel(
  file: ArrayBuffer,
): Promise<ParseResult<StockRowParsed>> {
  const wb = XLSX.read(file, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
  });

  const rows: StockRowParsed[] = [];
  const errors: ParseResult<StockRowParsed>["errors"] = [];

  json.forEach((raw, idx) => {
    const rowNumber = idx + 2;
    const normalized: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(raw)) {
      normalized[normalizeKey(k)] = v;
    }
    const sku = String(normalized.sku ?? "").trim();
    const stock = Number(normalized.stock ?? normalized["stock_quantity"] ?? -1);
    if (!sku) {
      errors.push({ row: rowNumber, message: "SKU faltante", raw });
      return;
    }
    if (Number.isNaN(stock) || stock < 0) {
      errors.push({ row: rowNumber, message: "Stock inválido", raw });
      return;
    }
    rows.push({ sku, stock_quantity: stock });
  });

  return { rows, errors };
}
