// Motor de normalización del catálogo — REGLAS, sin dependencias ni red.
//
// Fuente ÚNICA de verdad para inferir categoría / país / varietal / añada /
// formato a partir del nombre, varietal, proveedor y SKU de un producto.
//
// Se escribe en .mjs (ESM puro) a propósito: lo importa tanto la app Next/TS
// (allowJs) como el script de consola `scripts/audit-catalogo.mjs`. Así la
// lógica vive en un solo lugar y no se desincroniza.
//
// IMPORTANTE: este módulo NO usa el LLM. La IA es un respaldo aparte
// (lib/anthropic.ts → suggestProductCategory) que solo se invoca para los
// productos que aquí quedan marcados como `categoryAmbiguous`.

/** @typedef {"alta"|"media"|"baja"} Confidence */
/** @typedef {"category"|"country"|"varietal"|"vintage"|"volume_ml"} NormField */

/** Categorías válidas (espejo de PRODUCT_CATEGORIES en types/database.ts). */
export const CATEGORIES = [
  "vino_tinto",
  "vino_blanco",
  "vino_rosado",
  "vino_naranja",
  "espumoso",
  "destilado",
  "cerveza",
  "sake",
  "otro",
];

/** Etiquetas legibles para la UI y los reportes. */
export const CATEGORY_LABEL = {
  vino_tinto: "Vino Tinto",
  vino_blanco: "Vino Blanco",
  vino_rosado: "Vino Rosado",
  vino_naranja: "Vino Naranja",
  espumoso: "Espumoso",
  destilado: "Destilado",
  cerveza: "Cerveza",
  sake: "Sake",
  otro: "Otro",
};

/** minúsculas + sin acentos + espacios colapsados. */
function norm(s) {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** ¿alguna de las frases aparece como palabra/segmento en el texto normalizado? */
function hasAny(haystack, phrases) {
  for (const p of phrases) {
    // \b no funciona con guiones/apostrofes; usamos límites laxos.
    const re = new RegExp(`(^|[^a-z])${escapeRe(p)}([^a-z]|$)`, "i");
    if (re.test(haystack)) return p;
  }
  return null;
}
function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// --- Diccionarios -----------------------------------------------------------

const SPIRIT_WORDS = [
  "tequila", "mezcal", "mescal", "whisky", "whiskey", "bourbon", "scotch",
  "vodka", "ginebra", "gin", "ron", "rum", "brandy", "cognac", "conac",
  "armagnac", "licor", "liqueur", "aguardiente", "grappa", "pisco", "sotol",
  "raicilla", "bacanora", "calvados", "absenta", "anis", "sambuca", "amaretto",
  "cremas", "destilado", "espadin", "espadin",
];

const SPARKLING_WORDS = [
  "champagne", "champana", "champana", "cava", "prosecco", "proseco",
  "espumoso", "espumante", "spumante", "cremant", "lambrusco", "franciacorta",
  "blanc de blancs", "blanc de noirs", "brut", "metodo tradicional",
  "methode", "asti", "pet nat", "petnat", "petillant", "vino espumoso",
  "extra brut", "nature",
];

const BEER_WORDS = ["cerveza", "beer", "lager", "ipa", "pilsner", "pilsener", "stout", "ale", "porter"];

const SAKE_WORDS = ["sake", "junmai", "ginjo", "daiginjo", "nigori", "honjozo"];

const ORANGE_WORDS = ["vino naranja", "orange wine", "vino naranjo", "skin contact", "skin-contact", "contacto con piel"];

const ROSE_WORDS = ["rosado", "rose", "vin gris", "blush", "clarete", "rosato", "rosella"];

// Palabras de tipo explícitas en el nombre.
const TINTO_WORDS = ["tinto", "vino tinto", "red wine", "negroamaro"];
const BLANCO_WORDS = ["blanco", "vino blanco", "white wine", "bianco", "blanc"];

// Varietales tintos (multi-palabra primero para puntuar confianza alta).
const RED_VARIETALS = [
  "cabernet sauvignon", "cabernet franc", "petit verdot", "petite sirah",
  "pinot noir", "nero d'avola", "nero davola", "touriga nacional",
  "cabernet", "merlot", "malbec", "syrah", "shiraz", "tempranillo",
  "garnacha", "grenache", "sangiovese", "nebbiolo", "barbera", "montepulciano",
  "zinfandel", "primitivo", "carmenere", "bonarda", "tannat", "mourvedre",
  "monastrell", "aglianico", "mencia", "carignan", "carinena", "cinsault",
  "gamay", "dolcetto", "sagrantino", "blaufrankisch", "tinta", "tinto fino",
  "graciano", "nebra", "marselan", "pinotage",
];

// Varietales blancos.
const WHITE_VARIETALS = [
  "sauvignon blanc", "pinot grigio", "pinot gris", "chenin blanc",
  "grenache blanc", "garnacha blanca", "gruner veltliner", "pedro ximenez",
  "chardonnay", "riesling", "albarino", "verdejo", "viognier", "gewurztraminer",
  "semillon", "moscato", "muscat", "moscatel", "torrontes", "macabeo", "viura",
  "godello", "vermentino", "fiano", "greco", "trebbiano", "malvasia",
  "palomino", "marsanne", "roussanne", "chasselas", "silvaner", "verdicchio",
  "cortese", "glera", "airen", "loureiro", "treixadura", "xarel-lo", "xarel lo",
];

// Región / denominación → país (inferencia, confianza media).
const REGION_COUNTRY = [
  // México
  [["valle de guadalupe", "ensenada", "baja california", "parras", "queretaro", "san miguel de allende", "aguascalientes", "coahuila", "guanajuato", "valle de san vicente", "ojos negros"], "México"],
  // España
  [["rioja", "ribera del duero", "ribera", "priorat", "rias baixas", "rueda", "jumilla", "toro", "penedes", "jerez", "bierzo", "somontano", "carinena", "navarra", "montsant", "valdepenas"], "España"],
  // Francia
  [["burdeos", "bordeaux", "borgona", "bourgogne", "burgundy", "champagne", "rhone", "loira", "loire", "alsacia", "alsace", "provenza", "provence", "languedoc", "beaujolais", "chablis", "sancerre", "chateauneuf"], "Francia"],
  // Italia
  [["toscana", "tuscany", "chianti", "piamonte", "piemonte", "barolo", "barbaresco", "veneto", "valpolicella", "amarone", "brunello", "montalcino", "sicilia", "puglia", "abruzzo", "soave", "prosecco di"], "Italia"],
  // EUA
  [["napa", "sonoma", "paso robles", "california", "willamette", "oregon", "washington state", "central coast", "lodi", "santa barbara"], "Estados Unidos"],
  // Argentina / Chile
  [["mendoza", "uco", "lujan de cuyo", "salta", "cafayate", "patagonia argentina"], "Argentina"],
  [["maipo", "colchagua", "casablanca", "aconcagua", "valle central", "rapel", "curico", "maule", "limari"], "Chile"],
  // Otros
  [["douro", "alentejo", "vinho verde", "dao", "bairrada"], "Portugal"],
  [["marlborough", "central otago", "hawkes bay"], "Nueva Zelanda"],
  [["barossa", "mclaren vale", "margaret river", "coonawarra", "yarra"], "Australia"],
  [["mosela", "mosel", "rheingau", "pfalz"], "Alemania"],
  [["stellenbosch", "swartland", "western cape"], "Sudáfrica"],
];

// --- Inferencia de categoría ------------------------------------------------

/**
 * @param {{name?:string, varietal?:string|null, supplier?:string|null}} p
 * @returns {{category:string, confidence:Confidence, reason:string}|null}
 */
export function inferCategory(p) {
  const name = norm(p.name);
  const varietal = norm(p.varietal);
  const supplier = norm(p.supplier);
  const hay = `${name} | ${varietal} | ${supplier}`;

  // Helper: alta si el indicio está en el nombre; media si solo en varietal/proveedor.
  const lvl = (word) => (hasAny(name, [word]) ? "alta" : "media");

  // 1) Destilados (señal muy fuerte).
  let m = hasAny(hay, SPIRIT_WORDS);
  if (m) return { category: "destilado", confidence: lvl(m), reason: `Contiene "${m}" (destilado)` };

  // 2) Espumosos.
  m = hasAny(hay, SPARKLING_WORDS);
  if (m) return { category: "espumoso", confidence: lvl(m), reason: `Contiene "${m}" (espumoso)` };

  // 3) Cerveza.
  m = hasAny(hay, BEER_WORDS);
  if (m) return { category: "cerveza", confidence: lvl(m), reason: `Contiene "${m}" (cerveza)` };

  // 4) Sake.
  m = hasAny(hay, SAKE_WORDS);
  if (m) return { category: "sake", confidence: lvl(m), reason: `Contiene "${m}" (sake)` };

  // 5) Vino naranja.
  m = hasAny(hay, ORANGE_WORDS);
  if (m) return { category: "vino_naranja", confidence: lvl(m), reason: `Contiene "${m}" (vino naranja)` };

  // 6) Rosado.
  m = hasAny(hay, ROSE_WORDS);
  if (m) return { category: "vino_rosado", confidence: lvl(m), reason: `Contiene "${m}" (rosado)` };

  // 7) Palabra de tipo explícita.
  m = hasAny(name, TINTO_WORDS);
  if (m) return { category: "vino_tinto", confidence: "alta", reason: `Dice "${m}" en el nombre` };
  m = hasAny(name, BLANCO_WORDS);
  if (m) return { category: "vino_blanco", confidence: "alta", reason: `Dice "${m}" en el nombre` };

  // 8) Varietal. Si hay tinto y blanco a la vez (ensamble), es ambiguo.
  const red = hasAny(hay, RED_VARIETALS);
  const white = hasAny(hay, WHITE_VARIETALS);
  if (red && white) {
    return { category: "vino_tinto", confidence: "baja", reason: `Varietales mixtos ("${red}" y "${white}"): ambiguo` };
  }
  if (red) {
    const conf = red.includes(" ") ? "alta" : "media";
    return { category: "vino_tinto", confidence: hasAny(name, [red]) ? conf : "media", reason: `Varietal tinto "${red}"` };
  }
  if (white) {
    const conf = white.includes(" ") ? "alta" : "media";
    return { category: "vino_blanco", confidence: hasAny(name, [white]) ? conf : "media", reason: `Varietal blanco "${white}"` };
  }

  // 9) Sin señal: no se puede inferir por reglas.
  return null;
}

// --- País -------------------------------------------------------------------

/** @returns {{country:string, confidence:Confidence, reason:string}|null} */
export function inferCountry(p) {
  const hay = `${norm(p.name)} | ${norm(p.region_origin)} | ${norm(p.supplier)}`;
  for (const [regions, country] of REGION_COUNTRY) {
    const m = hasAny(hay, regions);
    if (m) return { country, confidence: "media", reason: `Región/origen "${m}" → ${country}` };
  }
  return null;
}

// --- Varietal ---------------------------------------------------------------

/** Extrae el varietal del nombre (el más específico / multi-palabra primero). */
export function inferVarietal(p) {
  const name = norm(p.name);
  const ordered = [...RED_VARIETALS, ...WHITE_VARIETALS].sort((a, b) => b.length - a.length);
  const m = hasAny(name, ordered);
  if (!m) return null;
  // Normaliza a Capitalización de Título.
  const pretty = m.replace(/\b\w/g, (c) => c.toUpperCase());
  return { varietal: pretty, confidence: "alta", reason: `Varietal "${m}" en el nombre` };
}

// --- Añada / cosecha --------------------------------------------------------

/** @returns {{vintage:string, confidence:Confidence, reason:string}|null} */
export function inferVintage(p) {
  const text = `${p.name ?? ""} ${p.sku ?? ""}`;
  // "N.V." / "NV" / "sin añada" → explícitamente sin cosecha.
  if (/\b(n\.?\s*v\.?|sin anada|sin añada|non vintage)\b/i.test(norm(p.name))) {
    return { vintage: "N.V.", confidence: "alta", reason: "Marcado como sin añada (N.V.)" };
  }
  const years = [...text.matchAll(/\b(19[5-9]\d|20[0-4]\d)\b/g)].map((x) => x[1]);
  if (!years.length) return null;
  // Si hay varios años, toma el más reciente plausible.
  const year = years.sort().reverse()[0];
  return { vintage: year, confidence: "alta", reason: `Año "${year}" en el nombre` };
}

// --- Formato / volumen ------------------------------------------------------

/** @returns {{volume_ml:number, confidence:Confidence, reason:string}|null} */
export function inferVolumeMl(p) {
  const text = norm(`${p.name ?? ""} ${p.sku ?? ""}`);
  // Magnum / media / nombres especiales.
  if (/\bmagnum\b/.test(text)) return { volume_ml: 1500, confidence: "alta", reason: 'Dice "magnum" (1500 ml)' };
  if (/\bmedia\b/.test(text) && /\bbotella\b/.test(text)) return { volume_ml: 375, confidence: "media", reason: "Media botella (375 ml)" };

  // 1.5 L / 1,5 lt / 0.75 l
  let m = /(\d+(?:[.,]\d+)?)\s*(l|lt|lts|litro|litros)\b/.exec(text);
  if (m) {
    const liters = parseFloat(m[1].replace(",", "."));
    if (liters > 0 && liters <= 18) {
      return { volume_ml: Math.round(liters * 1000), confidence: "alta", reason: `"${m[0].trim()}" → ${Math.round(liters * 1000)} ml` };
    }
  }
  // 750 ml / 375ml / 1500 cc
  m = /(\d{2,4})\s*(ml|cc|mililitros)\b/.exec(text);
  if (m) {
    const ml = parseInt(m[1], 10);
    if (ml >= 50 && ml <= 6000) return { volume_ml: ml, confidence: "alta", reason: `"${m[0].trim()}" → ${ml} ml` };
  }
  return null;
}

// --- Análisis combinado por producto ---------------------------------------

const DEFAULT_VOLUME = 750;

/**
 * Analiza un producto y devuelve las sugerencias de cambio (solo donde difiere
 * de lo actual) y si la categoría quedó ambigua (candidata a IA).
 *
 * Política conservadora:
 *  - categoría / añada / formato: marca DISCREPANCIAS contra lo actual.
 *  - país / varietal: solo RELLENA vacíos (no pisa datos ya capturados).
 *
 * @param {{
 *   category?:string|null, name:string, supplier?:string|null,
 *   varietal?:string|null, country?:string|null, region_origin?:string|null,
 *   vintage?:string|null, volume_ml?:number|null, sku?:string|null
 * }} p
 * @returns {{ suggestions: Array<{field:NormField,current:any,suggested:any,confidence:Confidence,source:"rules",reason:string}>, categoryAmbiguous: boolean }}
 */
export function analyzeProduct(p) {
  const suggestions = [];
  let categoryAmbiguous = false;

  // Categoría
  const cat = inferCategory(p);
  if (cat && cat.confidence !== "baja") {
    if (cat.category !== (p.category || null)) {
      suggestions.push({ field: "category", current: p.category ?? null, suggested: cat.category, confidence: cat.confidence, source: "rules", reason: cat.reason });
    }
  } else {
    // No se pudo inferir con confianza, o salió ambiguo. Candidato a IA si la
    // categoría actual está vacía o es el cajón "otro".
    if (!p.category || p.category === "otro") categoryAmbiguous = true;
    else if (cat && cat.confidence === "baja") categoryAmbiguous = true;
  }

  // País — solo rellena vacíos.
  if (!p.country) {
    const c = inferCountry(p);
    if (c) suggestions.push({ field: "country", current: null, suggested: c.country, confidence: c.confidence, source: "rules", reason: c.reason });
  }

  // Varietal — solo rellena vacíos.
  if (!p.varietal) {
    const v = inferVarietal(p);
    if (v) suggestions.push({ field: "varietal", current: null, suggested: v.varietal, confidence: v.confidence, source: "rules", reason: v.reason });
  }

  // Añada — marca discrepancia o rellena.
  const vint = inferVintage(p);
  if (vint && String(p.vintage || "") !== vint.vintage) {
    suggestions.push({ field: "vintage", current: p.vintage ?? null, suggested: vint.vintage, confidence: vint.confidence, source: "rules", reason: vint.reason });
  }

  // Formato — marca discrepancia (solo si el nombre dice algo distinto al valor).
  const vol = inferVolumeMl(p);
  if (vol && vol.volume_ml !== (p.volume_ml ?? DEFAULT_VOLUME)) {
    suggestions.push({ field: "volume_ml", current: p.volume_ml ?? null, suggested: vol.volume_ml, confidence: vol.confidence, source: "rules", reason: vol.reason });
  }

  return { suggestions, categoryAmbiguous };
}
