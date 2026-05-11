import * as XLSX from "xlsx";
import { PRODUCT_CATEGORIES, type ProductCategory } from "@/types/database";

export type ProductRowParsed = {
  sku: string;
  name: string;
  supplier: string;
  category: ProductCategory | null;
  varietal: string | null;
  country: string | null;
  region_origin: string | null;
  vintage: string | null;
  volume_ml: number;
  base_price: number;
  stock_quantity: number;
  active: boolean;
};

export type ParseResult<T> = {
  rows: T[];
  errors: { row: number; message: string; raw?: unknown }[];
};

const HEADER_MAP_PRODUCTS: Record<string, keyof ProductRowParsed> = {
  sku: "sku",
  nombre: "name",
  proveedor: "supplier",
  categoria: "category",
  varietal: "varietal",
  pais: "country",
  "región origen": "region_origin",
  "region origen": "region_origin",
  vintage: "vintage",
  añada: "vintage",
  "volumen ml": "volume_ml",
  "precio base": "base_price",
  stock: "stock_quantity",
  activo: "active",
};

function normalizeKey(k: string) {
  return k
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

function coerceCategory(v: unknown): ProductCategory | null {
  if (!v) return null;
  const k = String(v).toLowerCase().replace(/\s+/g, "_");
  return (PRODUCT_CATEGORIES as readonly string[]).includes(k)
    ? (k as ProductCategory)
    : null;
}

function coerceBool(v: unknown): boolean {
  if (typeof v === "boolean") return v;
  if (v == null) return true;
  const s = String(v).trim().toLowerCase();
  return !["no", "false", "0", "inactivo"].includes(s);
}

export async function parseProductsExcel(
  file: ArrayBuffer,
): Promise<ParseResult<ProductRowParsed>> {
  const wb = XLSX.read(file, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
  });
  const rows: ProductRowParsed[] = [];
  const errors: ParseResult<ProductRowParsed>["errors"] = [];

  json.forEach((raw, idx) => {
    const rowNumber = idx + 2; // 1 = header
    const normalized: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(raw)) {
      const nk = normalizeKey(k);
      const mapped = HEADER_MAP_PRODUCTS[nk];
      if (mapped) normalized[mapped] = v;
    }
    try {
      const sku = String(normalized.sku ?? "").trim();
      const name = String(normalized.name ?? "").trim();
      const supplier = String(normalized.supplier ?? "").trim();
      const base_price = Number(normalized.base_price ?? 0);
      if (!sku) throw new Error("SKU faltante");
      if (!name) throw new Error("Nombre faltante");
      if (!supplier) throw new Error("Proveedor faltante");
      if (!base_price || base_price <= 0)
        throw new Error("Precio base inválido");

      rows.push({
        sku,
        name,
        supplier,
        category: coerceCategory(normalized.category),
        varietal: String(normalized.varietal ?? "") || null,
        country: String(normalized.country ?? "") || null,
        region_origin: String(normalized.region_origin ?? "") || null,
        vintage: String(normalized.vintage ?? "") || null,
        volume_ml: Number(normalized.volume_ml ?? 750) || 750,
        base_price,
        stock_quantity: Number(normalized.stock_quantity ?? 0) || 0,
        active: coerceBool(normalized.active),
      });
    } catch (e) {
      errors.push({
        row: rowNumber,
        message: e instanceof Error ? e.message : "Error desconocido",
        raw,
      });
    }
  });

  return { rows, errors };
}
