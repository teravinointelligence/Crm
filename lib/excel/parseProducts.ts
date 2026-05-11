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

function normalizeKey(k: string) {
  return k
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[._-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const ALIASES: Record<keyof ProductRowParsed, string[]> = {
  sku: ["sku", "clave", "codigo", "codigo producto", "cod", "cve", "id", "articulo", "item"],
  name: ["nombre", "producto", "descripcion", "description", "nombre producto", "nombre del producto"],
  supplier: ["proveedor", "supplier", "marca", "bodega", "casa", "productor"],
  category: ["categoria", "category", "tipo", "tipo de vino", "linea"],
  varietal: ["varietal", "cepa", "uva", "uvas", "varietales"],
  country: ["pais", "country", "origen", "pais de origen"],
  region_origin: ["region origen", "region", "denominacion", "zona", "denominacion de origen", "appellation"],
  vintage: ["vintage", "anada", "añada", "cosecha", "ano", "año"],
  volume_ml: ["volumen ml", "volumen", "capacidad", "ml", "tamano", "tamaño"],
  base_price: ["precio base", "precio", "precio lista", "precio venta", "precio publico", "pvp", "costo"],
  stock_quantity: ["stock", "stock quantity", "existencia", "existencias", "inventario", "cantidad", "disponible"],
  active: ["activo", "active", "estatus", "status", "vigente"],
};

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

function coerceCategory(v: unknown): ProductCategory | null {
  if (!v) return null;
  const k = String(v).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
  const direct = k.replace(/\s+/g, "_");
  if ((PRODUCT_CATEGORIES as readonly string[]).includes(direct))
    return direct as ProductCategory;
  if (/tinto|red/.test(k)) return "vino_tinto";
  if (/blanco|white/.test(k)) return "vino_blanco";
  if (/rosa|rose/.test(k)) return "vino_rosado";
  if (/naranja|orange/.test(k)) return "vino_naranja";
  if (/espumo|sparkl|champ|cava|prosec/.test(k)) return "espumoso";
  if (/destila|spirit|licor|tequila|mezcal|whisk|ron|vodka|gin|brandy/.test(k))
    return "destilado";
  if (/cerveza|beer/.test(k)) return "cerveza";
  if (/sake/.test(k)) return "sake";
  return "otro";
}

function coerceBool(v: unknown): boolean {
  if (typeof v === "boolean") return v;
  if (v == null || v === "") return true;
  const s = String(v).trim().toLowerCase();
  return !["no", "false", "0", "inactivo", "n", "off"].includes(s);
}

function coerceNumber(v: unknown): number {
  if (typeof v === "number") return v;
  const n = Number(String(v ?? "").replace(/[,$\s]/g, ""));
  return Number.isNaN(n) ? 0 : n;
}

export async function parseProductsExcel(
  file: ArrayBuffer,
): Promise<ParseResult<ProductRowParsed>> {
  const wb = XLSX.read(file, { type: "array" });
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

  const detected: Partial<Record<keyof ProductRowParsed, string>> = {};
  for (const field of Object.keys(ALIASES) as (keyof ProductRowParsed)[]) {
    const n = detectColumn(normalizedKeys, ALIASES[field]);
    if (n) detected[field] = normalizedMap.get(n)!;
  }

  const missingRequired: string[] = [];
  if (!detected.sku) missingRequired.push("SKU (o Clave / Código)");
  if (!detected.name) missingRequired.push("Nombre (o Producto / Descripción)");
  if (!detected.supplier)
    missingRequired.push("Proveedor (o Marca / Bodega)");
  if (!detected.base_price)
    missingRequired.push("Precio Base (o Precio / Precio Lista)");
  if (missingRequired.length) {
    return {
      rows: [],
      errors: [
        {
          row: 1,
          message: `No detecté columnas: ${missingRequired.join(", ")}. Columnas encontradas: ${[...normalizedMap.values()].join(" · ")}`,
        },
      ],
    };
  }

  const rows: ProductRowParsed[] = [];
  const errors: ParseResult<ProductRowParsed>["errors"] = [];

  json.forEach((raw, idx) => {
    const rowNumber = idx + 2;
    try {
      const sku = String(raw[detected.sku!] ?? "").trim().replace(/\.0$/, "");
      const name = String(raw[detected.name!] ?? "").trim();
      const supplier = String(raw[detected.supplier!] ?? "").trim();
      const base_price = coerceNumber(raw[detected.base_price!]);
      if (!sku) throw new Error("SKU vacío");
      if (!name) throw new Error("Nombre vacío");
      if (!supplier) throw new Error("Proveedor vacío");
      if (base_price <= 0) throw new Error(`Precio base inválido (${raw[detected.base_price!]})`);

      rows.push({
        sku,
        name,
        supplier,
        category: detected.category
          ? coerceCategory(raw[detected.category])
          : null,
        varietal: detected.varietal
          ? String(raw[detected.varietal] ?? "").trim() || null
          : null,
        country: detected.country
          ? String(raw[detected.country] ?? "").trim() || null
          : null,
        region_origin: detected.region_origin
          ? String(raw[detected.region_origin] ?? "").trim() || null
          : null,
        vintage: detected.vintage
          ? String(raw[detected.vintage] ?? "").trim() || null
          : null,
        volume_ml: detected.volume_ml
          ? coerceNumber(raw[detected.volume_ml]) || 750
          : 750,
        base_price,
        stock_quantity: detected.stock_quantity
          ? coerceNumber(raw[detected.stock_quantity])
          : 0,
        active: detected.active ? coerceBool(raw[detected.active]) : true,
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
