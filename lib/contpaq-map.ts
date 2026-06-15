// Empareja el export de CONTPAQ (codigo + clave/nombre) contra el catálogo del
// CRM para poblar products.codigo_contpaqi. PURO y testeable.
//
// Estrategia (de más a menos confiable):
//   1. exact por SKU   → row.clave == products.sku
//   2. exact por nombre→ normalize(row.nombre) == normalize(products.name)
//   3. fuzzy por nombre→ similitud de tokens (Jaccard) sobre un umbral
//   4. sin match
// Los match exactos se pueden aplicar directo; los fuzzy van a revisión humana.

export type ContpaqRow = { codigo: string; clave: string | null; nombre: string | null };
export type CatalogProduct = { id: string; sku: string | null; name: string; codigo_contpaqi: string | null };

export type MatchVia = "sku" | "nombre" | "fuzzy" | "none";

export type ContpaqMatch = {
  codigo: string;
  exportName: string;
  product_id: string | null;
  productName: string | null;
  productSku: string | null;
  via: MatchVia;
  score: number; // 1 = exacto; 0..1 fuzzy; 0 sin match
  alreadyMapped: boolean; // el producto ya tenía un codigo_contpaqi distinto
};

export const FUZZY_THRESHOLD = 0.6;

const STOP = new Set([
  "ml", "cl", "lt", "bot", "botella", "cj", "caja", "vino", "tinto", "blanco",
  "de", "la", "el", "los", "las", "del", "y", "con", "sin",
]);

export function normalizeName(s: string | null | undefined): string {
  return String(s ?? "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\d+\s*\/\s*\d+\s*ML/g, " ") // "24/355 ML"
    .replace(/\d+\s*ML/g, " ")
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(s: string | null | undefined): Set<string> {
  return new Set(
    normalizeName(s)
      .split(" ")
      .filter((w) => w.length > 2 && !STOP.has(w.toLowerCase())),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter += 1;
  return inter / (a.size + b.size - inter);
}

const skuKey = (s: string | null) => (s ?? "").trim().toLowerCase();

export function matchContpaqRows(input: {
  products: CatalogProduct[];
  rows: ContpaqRow[];
}): ContpaqMatch[] {
  const { products, rows } = input;
  const bySku = new Map<string, CatalogProduct>();
  const byName = new Map<string, CatalogProduct>();
  const prodTokens = products.map((p) => ({ p, t: tokens(p.name) }));
  for (const p of products) {
    if (p.sku) bySku.set(skuKey(p.sku), p);
    const n = normalizeName(p.name);
    if (n && !byName.has(n)) byName.set(n, p);
  }

  return rows.map((row) => {
    const codigo = String(row.codigo).trim();
    const exportName = row.nombre?.trim() || "";

    const build = (p: CatalogProduct | null, via: MatchVia, score: number): ContpaqMatch => ({
      codigo,
      exportName,
      product_id: p?.id ?? null,
      productName: p?.name ?? null,
      productSku: p?.sku ?? null,
      via,
      score,
      alreadyMapped: !!(p?.codigo_contpaqi && p.codigo_contpaqi !== codigo),
    });

    // 1. SKU exacto
    if (row.clave) {
      const p = bySku.get(skuKey(row.clave));
      if (p) return build(p, "sku", 1);
    }
    // 2. Nombre exacto normalizado
    if (exportName) {
      const p = byName.get(normalizeName(exportName));
      if (p) return build(p, "nombre", 1);
    }
    // 3. Fuzzy por nombre
    if (exportName) {
      const rt = tokens(exportName);
      let best: CatalogProduct | null = null;
      let bestScore = 0;
      for (const { p, t } of prodTokens) {
        const s = jaccard(rt, t);
        if (s > bestScore) {
          bestScore = s;
          best = p;
        }
      }
      if (best && bestScore >= FUZZY_THRESHOLD) return build(best, "fuzzy", Math.round(bestScore * 100) / 100);
    }
    // 4. Sin match
    return build(null, "none", 0);
  });
}
