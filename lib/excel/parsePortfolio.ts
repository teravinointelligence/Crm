import * as XLSX from "xlsx";
import type { ParseResult, ProductRowParsed } from "./parseProducts";

const HEADER_TOKENS = ["vino", "region", "añada", "anada", "medida", "iva"];

function normalize(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

function slug(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function parseVolumeMl(raw: unknown): number {
  if (raw == null || raw === "") return 750;
  const s = String(raw).trim().toLowerCase().replace(/\s+/g, "");
  const litersMatch = /^([\d.,]+)\s*l$/.exec(s);
  if (litersMatch) {
    const n = Number(litersMatch[1].replace(",", "."));
    if (!Number.isNaN(n)) return Math.round(n * 1000);
  }
  const mlMatch = /^([\d.,]+)\s*ml$/.exec(s);
  if (mlMatch) {
    const n = Number(mlMatch[1].replace(",", "."));
    if (!Number.isNaN(n)) return Math.round(n);
  }
  const num = Number(String(raw).replace(/[^\d.,]/g, "").replace(",", "."));
  if (!Number.isNaN(num) && num > 0) return num < 10 ? Math.round(num * 1000) : Math.round(num);
  return 750;
}

function cleanVintage(raw: unknown): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s || /^(n[\s.\-/]?v[\s.]?|s\/a|sin\s*a[ñn]ada|-)$/i.test(s)) return null;
  return s;
}

function firstWord(name: string): string {
  const cleaned = name.trim().replace(/^(château|chateau|domaine|bodega|bodegas|hacienda|finca|casa|villa|maison)\s+/i, "$& ");
  const parts = cleaned.split(/\s+/);
  if (!parts.length) return "Sin asignar";
  if (parts.length >= 2 && /^(château|chateau|domaine|bodega|bodegas|hacienda|finca|casa|villa|maison)$/i.test(parts[0])) {
    return `${parts[0]} ${parts[1]}`;
  }
  return parts[0] || "Sin asignar";
}

function inferCategoryFromName(name: string): ProductRowParsed["category"] {
  const n = normalize(name);
  if (/champ|cava|prosec|espumo|brut|sparkl/.test(n)) return "espumoso";
  if (/blanc|chardonnay|sauvignon\s*blanc|riesling|albariño|viognier|gew[uü]rztraminer|chenin/.test(n))
    return "vino_blanco";
  if (/rose|rosé|rosa/.test(n)) return "vino_rosado";
  if (/naranja|orange/.test(n)) return "vino_naranja";
  if (/tequila|mezcal|whisk|bourbon|gin|vodka|ron|rum|brandy|cognac|grappa|destilado/.test(n))
    return "destilado";
  if (/cerveza|beer|ale|ipa|lager/.test(n)) return "cerveza";
  if (/sake/.test(n)) return "sake";
  return "vino_tinto";
}

function parseSection(text: string): {
  country: string | null;
  region: string | null;
  bodega: string | null;
} {
  const cleaned = text.replace(/\s+/g, " ").trim();
  const sep = /\s—\s|\s–\s|\s-\s/;
  let country: string | null = null;
  let region: string | null = null;
  let bodega: string | null = null;
  if (sep.test(cleaned)) {
    const [c, ...rest] = cleaned.split(sep);
    country = c.trim() || null;
    const r = rest.join(" - ");
    if (r.includes("·")) {
      const [reg, ...b] = r.split("·");
      region = reg.trim() || null;
      bodega = b.join("·").trim() || null;
    } else region = r.trim() || null;
  } else if (cleaned.includes("·")) {
    const [c, ...b] = cleaned.split("·");
    country = c.trim() || null;
    bodega = b.join("·").trim() || null;
  } else {
    country = cleaned || null;
  }
  return { country, region, bodega };
}

export async function parsePortfolioExcel(
  buf: ArrayBuffer,
): Promise<ParseResult<ProductRowParsed>> {
  const wb = XLSX.read(buf, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
    raw: true,
  });

  let headerRow = -1;
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const row = (rows[i] ?? []) as unknown[];
    const cells = row.map((c) => normalize(String(c ?? "")));
    const matches = HEADER_TOKENS.filter((t) => cells.some((c) => c.includes(t))).length;
    if (matches >= 3) {
      headerRow = i;
      break;
    }
  }

  if (headerRow < 0) {
    return {
      rows: [],
      errors: [
        {
          row: 0,
          message:
            "No encontré la fila de encabezados (esperaba columnas tipo VINO / REGIÓN / AÑADA / MEDIDA / s/IVA / c/IVA en las primeras 15 filas).",
        },
      ],
    };
  }

  const header = (rows[headerRow] as unknown[]).map((c) => normalize(String(c ?? "")));
  const idx = {
    vino: header.findIndex((c) => c.includes("vino") || c.includes("producto") || c.includes("nombre")),
    region: header.findIndex((c) => c.includes("region") || c.includes("denominacion") || c.includes("zona")),
    vintage: header.findIndex((c) => c.includes("añada") || c.includes("anada") || c.includes("cosecha") || c.includes("vintage") || c.includes("año") || c.includes("ano")),
    volume: header.findIndex((c) => c.includes("medida") || c.includes("volumen") || c.includes("capacidad") || c.includes("tamaño") || c.includes("tamano") || c === "ml"),
    priceSinIva: header.findIndex((c) => /(s\/?\s*iva|sin\s*iva|precio\s*neto|precio\s*sin|s\.\s*iva)/.test(c)),
    priceConIva: header.findIndex((c) => /(c\/?\s*iva|con\s*iva|precio\s*con|c\.\s*iva|publico|pvp)/.test(c)),
    priceAny: header.findIndex((c) => c.includes("precio")),
  };

  if (idx.vino < 0 || (idx.priceSinIva < 0 && idx.priceConIva < 0 && idx.priceAny < 0)) {
    return {
      rows: [],
      errors: [
        {
          row: headerRow + 1,
          message: `Encabezados detectados pero faltan columnas clave (VINO o algún precio). Encontré: ${header.filter(Boolean).join(" · ")}`,
        },
      ],
    };
  }

  const items: ProductRowParsed[] = [];
  const errors: ParseResult<ProductRowParsed>["errors"] = [];
  let currentCountry: string | null = null;
  let currentRegion: string | null = null;
  let currentBodega: string | null = null;
  const seenSkus = new Set<string>();

  for (let i = headerRow + 1; i < rows.length; i++) {
    const row = (rows[i] ?? []) as unknown[];
    const rowNumber = i + 1;
    const first = String(row[idx.vino] ?? "").trim();
    if (!first) continue;

    const priceSin = idx.priceSinIva >= 0 ? row[idx.priceSinIva] : undefined;
    const priceCon = idx.priceConIva >= 0 ? row[idx.priceConIva] : undefined;
    const priceAny = idx.priceAny >= 0 ? row[idx.priceAny] : undefined;
    const hasPrice =
      (priceSin != null && priceSin !== "" && !Number.isNaN(Number(priceSin))) ||
      (priceCon != null && priceCon !== "" && !Number.isNaN(Number(priceCon))) ||
      (priceAny != null && priceAny !== "" && !Number.isNaN(Number(priceAny)));

    if (!hasPrice) {
      const parsed = parseSection(first);
      if (parsed.country) {
        currentCountry = parsed.country;
        currentRegion = parsed.region;
        currentBodega = parsed.bodega;
      }
      continue;
    }

    try {
      const name = first;
      const vintage = idx.vintage >= 0 ? cleanVintage(row[idx.vintage]) : null;
      const volume_ml = idx.volume >= 0 ? parseVolumeMl(row[idx.volume]) : 750;
      const rawPrice =
        priceSin != null && priceSin !== "" && Number(priceSin) > 0
          ? Number(priceSin)
          : priceCon != null && priceCon !== "" && Number(priceCon) > 0
            ? Number(priceCon) / 1.16
            : priceAny != null && priceAny !== "" && Number(priceAny) > 0
              ? Number(priceAny)
              : 0;
      const base_price = Math.round(rawPrice * 100) / 100;
      if (base_price <= 0) throw new Error(`Precio inválido (${rawPrice})`);

      const region = idx.region >= 0 ? String(row[idx.region] ?? "").trim() : "";
      const region_origin = region || currentRegion;
      const country = currentCountry;
      const supplier = currentBodega || firstWord(name);

      let sku = `${slug(name)}-${slug(vintage ?? "nv")}-${volume_ml}`.toUpperCase();
      if (seenSkus.has(sku)) sku = `${sku}-${i}`;
      seenSkus.add(sku);

      items.push({
        sku,
        name,
        supplier,
        category: inferCategoryFromName(name),
        varietal: null,
        country,
        region_origin,
        vintage,
        volume_ml,
        base_price,
        stock_quantity: 0,
        active: true,
      });
    } catch (e) {
      errors.push({
        row: rowNumber,
        message: e instanceof Error ? e.message : "Error desconocido",
        raw: row,
      });
    }
  }

  return { rows: items, errors };
}
