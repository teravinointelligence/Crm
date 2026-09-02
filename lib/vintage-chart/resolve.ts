// Resuelve la calificación de añada del Robert Parker Wine Advocate Vintage
// Chart para un vino del catálogo, mapeando `region_origin` (+ cepa cuando hace
// falta desambiguar) a la región del chart. Devuelve null cuando el vino no
// cae en una región/añada calificada — en ese caso simplemente no se muestra
// nada (mejor sin dato que con un dato equivocado).
import { VINTAGE_DATA, VINTAGE_REGIONS } from "./data";

export type MaturityCode = "T" | "R" | "E" | "C" | "I";

export interface VintageRating {
  regionKey: string;
  /** Etiqueta de la región en español. */
  regionLabel: string;
  /** Nombre oficial de la región en el chart de RP (atribución). */
  rpName: string;
  year: number;
  scoreLow: number;
  /** Set sólo cuando el chart trae un rango (estimación de barrica/en-primeur). */
  scoreHigh: number | null;
  isRange: boolean;
  maturity: MaturityCode | null;
  /** Banda de calidad en español (según la leyenda del chart). */
  band: string;
  maturityLabel: string | null;
  /** Frase corta orientada a venta. */
  salesHint: string;
  /** Celda original del chart (ej. "94T", "92-95T"). */
  raw: string;
}

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
function norm(s: string | null | undefined): string {
  return stripAccents((s ?? "").toLowerCase())
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function scoreBand(score: number): string {
  if (score >= 96) return "Extraordinaria";
  if (score >= 90) return "Excepcional";
  if (score >= 80) return "Muy buena a excelente";
  if (score >= 70) return "Media";
  if (score >= 60) return "Por debajo del promedio";
  return "Deficiente";
}

const MATURITY_LABEL: Record<MaturityCode, string> = {
  T: "Aún tánica / joven, de guarda",
  R: "Lista para beber",
  E: "De maduración temprana, accesible",
  C: "Precaución, puede estar pasada",
  I: "Añada irregular, incluso entre los mejores",
};

// Celda válida: 2-3 dígitos, rango opcional, y un código de madurez opcional.
const CELL = /^(\d{2,3})(?:-(\d{2,3}))?([TRECI])?$/;
function parseCell(
  raw: string,
): { low: number; high: number | null; maturity: MaturityCode | null } | null {
  const m = CELL.exec(raw);
  if (!m) return null;
  return {
    low: parseInt(m[1], 10),
    high: m[2] ? parseInt(m[2], 10) : null,
    maturity: (m[3] as MaturityCode) ?? null,
  };
}

/**
 * Mapea la región de origen (+ cepa/categoría/nombre) a la clave de región del
 * chart. Reglas ordenadas de específico a general. Devuelve null si no hay una
 * región del chart que corresponda con confianza (México, Provence, "California"
 * genérico, "South of France", etc.) — en catálogo la cepa suele venir en el
 * NOMBRE del vino, no en `varietal`, así que se detecta de ambos.
 */
function matchRegionKey(
  regionOrigin: string,
  varietal: string,
  category: string | null,
  name: string,
): string | null {
  const r = norm(regionOrigin);
  // La cepa/color se detecta del nombre + varietal (varietal casi siempre nulo).
  const g = norm(`${varietal} ${name}`);
  const isWhite =
    category === "vino_blanco" ||
    category === "espumoso" ||
    category === "vino_naranja" ||
    category === "vino_rosado" ||
    // OJO: "sauvignon" a secas NO (Cabernet Sauvignon es tinto); sólo "sauvignon blanc".
    /\b(blanc|blanco|bianco|white|chardonnay|sauvignon blanc|riesling|albarino|verdejo|chenin|gewurztraminer|pinot grigio|pinot gris|rose|rosado)\b/.test(g);
  const has = (needle: string) => r.includes(needle);
  const someHas = (xs: string[]) => xs.some((x) => r.includes(x));

  // --- California North Coast (se separa por cepa; cepa del nombre) ---
  const northCoast = [
    "napa", "sonoma", "knights valley", "alexander valley", "russian river",
    "rutherford", "oakville", "howell mountain", "mount veeder", "stags leap",
    "carneros", "calistoga", "st helena", "spring mountain", "diamond mountain",
  ];
  if (someHas(northCoast)) {
    if (g.includes("zinfandel")) return "us-north-zin";
    if (g.includes("pinot noir") || g.includes("pinot nero")) return "us-north-pinot";
    if (g.includes("chardonnay")) return "us-north-chard";
    // Blancos que NO son Chardonnay (ej. Sauvignon Blanc) no tienen fila propia
    // de North Coast: mejor no forzarlos a la de Chardonnay.
    if (isWhite) return null;
    return "us-north-cab"; // cabernet, cabernet franc, merlot, mezclas tintas.
  }
  if (has("paso robles")) return "us-paso-robles";
  if (someHas([
    "santa barbara", "santa rita", "sta rita", "santa maria", "edna valley",
    "monterey", "central coast", "san luis obispo", "arroyo grande",
  ])) return "us-central-coast";
  if (someHas(["willamette", "yamhill", "dundee", "oregon", "eola"]))
    return "us-willamette";

  // --- Burdeos --- (Pessac/Graves y St-Émilion antes que "medoc" genérico)
  if (someHas(["pessac", "leognan", "graves"])) return "bordeaux-graves";
  if (has("emilion")) return "bordeaux-st-emilion";
  if (someHas(["sauternes", "barsac"])) return "bordeaux-sauternes";
  if (someHas(["pauillac", "saint julien", "st julien", "saint estephe", "st estephe", "medoc"]))
    return "bordeaux-medoc-north"; // incluye Médoc/Haut-Médoc (misma banda Margaux/Left Bank)

  // --- Borgoña / Beaujolais ---
  if (someHas(["beaujolais", "fleurie", "morgon", "moulin a vent", "brouilly", "julienas"]))
    return "beaujolais";
  // Apelaciones intrínsecamente blancas → Borgoña blanco (la categoría del
  // catálogo no es confiable, así que la apelación manda).
  const bWhiteAppellation = [
    "meursault", "chassagne", "puligny", "montrachet", "chablis", "macon",
    "pouilly fuisse", "saint veran", "corton charlemagne",
  ];
  if (someHas(bWhiteAppellation)) return "burgundy-white";
  const nuits = [
    "gevrey", "chambertin", "chambolle", "musigny", "vosne", "romanee",
    "vougeot", "nuits st", "morey", "flagey", "marsannay", "fixin",
  ];
  if (someHas(nuits)) return "burgundy-nuits-red";
  const beaune = ["pommard", "volnay", "beaune", "corton", "mercurey", "savigny", "monthelie"];
  if (someHas(beaune))
    return isWhite || g.includes("chardonnay") ? "burgundy-white" : "burgundy-beaune-red";
  // "Burgundy" genérico: sólo se resuelve si el nombre delata la sub-zona/color.
  if (has("burgundy") || has("bourgogne")) {
    if (["chablis", "chardonnay", "blanc", "meursault", "montrachet"].some((x) => g.includes(x)))
      return "burgundy-white";
    if (nuits.some((x) => g.includes(x))) return "burgundy-nuits-red";
    if (["beaune", "pommard", "volnay"].some((x) => g.includes(x))) return "burgundy-beaune-red";
    return null; // ambiguo → sin dato
  }

  // --- Champagne / Loira / Ródano / Alsacia / Languedoc ---
  if (has("champagne")) return "champagne";
  if (someHas(["sancerre", "pouilly fume", "vouvray", "muscadet", "touraine", "savenniere", "quincy"]))
    return "loire-white";
  if (someHas(["cote rotie", "hermitage", "cornas", "saint joseph", "st joseph", "crozes", "condrieu"]))
    return "rhone-north";
  if (someHas(["alsace", "riquewihr", "ribeauville"])) return "alsace";
  if (someHas(["languedoc", "picpoul", "pinet", "corbieres", "minervois", "faugeres", "fitou", "saint chinian"]))
    return "languedoc";

  // --- Italia ---
  if (has("barbaresco")) return "piedmont-barbaresco";
  if (has("barolo")) return "piedmont-barolo";
  if (has("collio") || has("friuli")) return "friuli-collio";
  if (has("etna") || (has("sicil") && !isWhite)) return "sicily-etna";
  // Toscana genérica: sólo con denominación explícita en el nombre.
  if (has("tuscany") || has("toscana") || has("chianti") || has("brunello") || has("bolgheri")) {
    if (r.includes("chianti") || g.includes("chianti")) return "tuscany-chianti";
    if (r.includes("brunello") || g.includes("brunello") || g.includes("montalcino"))
      return "tuscany-brunello";
    if (r.includes("bolgheri") || g.includes("bolgheri")) return "tuscany-bolgheri";
    return null; // super-toscano IGT sin denominación clara → sin dato
  }

  // --- España ---
  if (has("rioja")) return "rioja";
  if (has("ribera del duero")) return "ribera-duero";
  if (someHas(["rias baixas", "ribeiro", "valdeorras", "galicia"])) return "galicia";

  // --- Nuevo mundo ---
  if (someHas(["mendoza", "uco", "lujan", "cafayate", "salta"])) return "argentina";
  if (someHas(["barossa", "mclaren", "adelaide"])) return "au-barossa";
  if (someHas(["marlborough", "central otago", "hawke", "martinborough", "new zealand", "nueva zelanda"]))
    return "new-zealand";
  if (someHas(["stellenbosch", "constantia", "swartland", "western cape", "paarl", "franschhoek", "south africa", "sudafrica"]))
    return "south-africa";

  return null;
}

function salesHint(top: number, isRange: boolean, maturity: MaturityCode | null): string {
  if (isRange) return "Añada nueva, calificación preliminar (en barrica).";
  if (maturity === "C") return "Añada delicada — puede estar pasada; confirma antes de ofrecer.";
  if (maturity === "I") return "Añada irregular — selecciona bien el productor.";
  if (top >= 96) return "Añada extraordinaria — argumento de venta muy fuerte.";
  if (top >= 93) return "Gran añada — buen gancho para empujar el vino.";
  if (top >= 90) return "Añada excepcional — buen argumento de venta.";
  if (top >= 87) return "Añada sólida.";
  if (top >= 80) return "Añada correcta.";
  return "Añada floja — mejor no destacarla.";
}

/** Devuelve la calificación de añada de RP para un producto, o null. */
export function resolveVintageRating(p: {
  region_origin?: string | null;
  varietal?: string | null;
  category?: string | null;
  vintage?: string | null;
  name?: string | null;
}): VintageRating | null {
  if (!p.region_origin || !p.vintage) return null;
  const ym = /(\d{4})/.exec(p.vintage);
  if (!ym) return null;
  const year = parseInt(ym[1], 10);

  const key = matchRegionKey(p.region_origin, p.varietal ?? "", p.category ?? null, p.name ?? "");
  if (!key) return null;
  const raw = VINTAGE_DATA[key]?.[String(year)];
  if (!raw) return null;
  const parsed = parseCell(raw);
  if (!parsed) return null;

  const meta = VINTAGE_REGIONS.find((m) => m.key === key);
  if (!meta) return null;
  const top = parsed.high ?? parsed.low;
  return {
    regionKey: key,
    regionLabel: meta.labelEs,
    rpName: meta.rpName,
    year,
    scoreLow: parsed.low,
    scoreHigh: parsed.high,
    isRange: parsed.high != null,
    maturity: parsed.maturity,
    band: scoreBand(top),
    maturityLabel: parsed.maturity ? MATURITY_LABEL[parsed.maturity] : null,
    salesHint: salesHint(top, parsed.high != null, parsed.maturity),
    raw,
  };
}
