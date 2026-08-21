/** Normaliza nombres de PDF, productos y SKU para compararlos sin formato. */
export function normalizeTechnicalSheetKey(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\.pdf$/i, "")
    .replace(/ficha[\s_-]*tecnica/g, "")
    .replace(/hoja[\s_-]*de[\s_-]*venta/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

function matchScore(file, product) {
  const fileKey = normalizeTechnicalSheetKey(file.name);
  const skuKey = normalizeTechnicalSheetKey(product.sku);
  const nameKey = normalizeTechnicalSheetKey(product.name);
  const supplierKey = normalizeTechnicalSheetKey(product.supplier);
  const vintageKey = normalizeTechnicalSheetKey(product.vintage);
  let score = 0;
  if (skuKey.length >= 5 && fileKey.includes(skuKey)) score = 120;
  if (nameKey.length >= 6 && fileKey.includes(nameKey)) score = Math.max(score, 90);
  if (score > 0 && supplierKey.length >= 4 && fileKey.includes(supplierKey)) score += 5;
  if (score > 0 && vintageKey.length === 4 && fileKey.includes(vintageKey)) score += 15;
  return score;
}

/**
 * Devuelve una coincidencia automática solo cuando hay un ganador único.
 * Ante empate, exige que el admin vincule el PDF manualmente.
 */
export function autoMatchDriveFile(file, products) {
  const ranked = products
    .map((product) => ({ product, score: matchScore(file, product) }))
    .filter((candidate) => candidate.score >= 90)
    .sort((a, b) => b.score - a.score);
  if (!ranked[0] || ranked[1]?.score === ranked[0].score) return null;
  return ranked[0].product;
}
