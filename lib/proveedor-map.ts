// Empareja un archivo de "proveedor por producto" contra el catálogo del CRM
// para poblar products.supplier (el proveedor real con el que se agrupan las
// sugerencias de reabasto). PURO y testeable.
//
// Estrategia (de más a menos confiable):
//   1. exact por SKU            → row.sku == products.sku
//   2. exact por código CONTPAQ → row.codigo == products.codigo_contpaqi
//   3. exact por nombre         → normalize(row.nombre) == normalize(products.name)
//   4. fuzzy por nombre         → Jaccard de tokens sobre un umbral
//   5. sin match
// Los exactos se aplican directo; los fuzzy van a revisión humana.

// normalizeName: misma lógica que lib/contpaq-map (inline para que el módulo
// sea puro y testeable con node --test sin resolver el alias @/).
export function normalizeName(s: string | null | undefined): string {
  return String(s ?? "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\d+\s*\/\s*\d+\s*ML/g, " ")
    .replace(/\d+\s*ML/g, " ")
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export type ProveedorRow = {
  proveedor: string;
  sku: string | null;
  codigo: string | null;
  nombre: string | null;
};

export type CatalogProductForProveedor = {
  id: string;
  sku: string | null;
  name: string;
  codigo_contpaqi: string | null;
  supplier: string | null;
};

export type MatchViaProv = "sku" | "codigo" | "nombre" | "fuzzy" | "none";

export type ProveedorMatch = {
  key: string; // identificador único de la fila (para selección)
  proveedor: string;
  exportName: string;
  product_id: string | null;
  productName: string | null;
  productSku: string | null;
  currentSupplier: string | null;
  via: MatchViaProv;
  score: number; // 1 = exacto; 0..1 fuzzy; 0 sin match
  changes: boolean; // el proveedor nuevo difiere del actual
};

export const FUZZY_THRESHOLD = 0.6;

const STOP = new Set([
  "ml", "cl", "lt", "bot", "botella", "cj", "caja", "vino", "tinto", "blanco",
  "de", "la", "el", "los", "las", "del", "y", "con", "sin",
]);

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

const key = (s: string | null) => (s ?? "").trim().toLowerCase();

export function matchProveedorRows(input: {
  products: CatalogProductForProveedor[];
  rows: ProveedorRow[];
}): ProveedorMatch[] {
  const { products, rows } = input;
  const bySku = new Map<string, CatalogProductForProveedor>();
  const byCodigo = new Map<string, CatalogProductForProveedor>();
  const byName = new Map<string, CatalogProductForProveedor>();
  const prodTokens = products.map((p) => ({ p, t: tokens(p.name) }));
  for (const p of products) {
    if (p.sku) bySku.set(key(p.sku), p);
    if (p.codigo_contpaqi) byCodigo.set(key(p.codigo_contpaqi), p);
    const n = normalizeName(p.name);
    if (n && !byName.has(n)) byName.set(n, p);
  }

  return rows.map((row, idx) => {
    const proveedor = row.proveedor.trim();
    const exportName = row.nombre?.trim() || "";

    const build = (
      p: CatalogProductForProveedor | null,
      via: MatchViaProv,
      score: number,
    ): ProveedorMatch => ({
      key: `${idx}`,
      proveedor,
      exportName,
      product_id: p?.id ?? null,
      productName: p?.name ?? null,
      productSku: p?.sku ?? null,
      currentSupplier: p?.supplier ?? null,
      via,
      score,
      changes: !!p && (p.supplier ?? "").trim() !== proveedor,
    });

    if (row.sku) {
      const p = bySku.get(key(row.sku));
      if (p) return build(p, "sku", 1);
    }
    if (row.codigo) {
      const p = byCodigo.get(key(row.codigo));
      if (p) return build(p, "codigo", 1);
    }
    if (exportName) {
      const p = byName.get(normalizeName(exportName));
      if (p) return build(p, "nombre", 1);
    }
    if (exportName) {
      const rt = tokens(exportName);
      let best: CatalogProductForProveedor | null = null;
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
    return build(null, "none", 0);
  });
}
