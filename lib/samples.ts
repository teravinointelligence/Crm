// Bodegas físicas donde se resguardan las botellas de muestra del banco.
// Es una dimensión distinta de la zona de ventas (region) de la cuenta/vendedor.
export const SAMPLE_LOCATIONS = [
  "Bodega San José",
  "Bodega La Paz",
  "Bodega Vallarta",
  "Bodega Tijuana",
] as const;

export type SampleLocation = (typeof SAMPLE_LOCATIONS)[number];

// ── Candado de consumo por cliente ───────────────────────────────────────────
// Un cliente no puede recibir más de `botellasPorCliente` botellas de muestra
// en una ventana rodante de `ventanaDias` días. Las capacitaciones quedan
// fuera del tope pero SOLO de vinos que el cliente ya compró (compra real en
// monthly_sales_items); el Admin queda exento de todo.
// FOOTGUN: el candado real vive en la BD (tg_sample_client_cap, migración
// 0092) con estos MISMOS números; esto solo alimenta los textos de la UI.
// Si cambias uno, cambia el otro.
export const SAMPLE_CAP = {
  botellasPorCliente: 6,
  ventanaDias: 30,
} as const;

// ── Rendimiento de muestras para capacitaciones / catas ──────────────────────
// Estándar TERAVINO: se sirven 2 onzas por participante de una botella de 750 ml,
// por lo que cada botella rinde ~12 personas (antes se asumían 8, a ~3 oz).
export const ML_PER_OUNCE = 29.5735;
export const OUNCES_PER_PERSON = 2;
export const DEFAULT_BOTTLE_ML = 750;

/** Personas que rinde un volumen total (ml) sirviendo `ouncesPerPerson` onzas a cada una. */
export function peopleServed(totalMl: number, ouncesPerPerson = OUNCES_PER_PERSON): number {
  if (totalMl <= 0 || ouncesPerPerson <= 0) return 0;
  return Math.floor(totalMl / ML_PER_OUNCE / ouncesPerPerson);
}

/** Personas que rinde una cantidad de botellas de cierto volumen. */
export function peoplePerBottles(
  bottles: number,
  bottleMl = DEFAULT_BOTTLE_ML,
  ouncesPerPerson = OUNCES_PER_PERSON,
): number {
  return peopleServed(bottles * bottleMl, ouncesPerPerson);
}
