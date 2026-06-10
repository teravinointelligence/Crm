// Rendimiento de muestras para capacitaciones / catas.
// Estándar TERAVINO: se sirven 2 onzas por participante de una botella de 750 ml,
// por lo que cada botella rinde ~12 personas.
export const ML_PER_OUNCE = 29.5735;
export const OUNCES_PER_PERSON = 2;
export const DEFAULT_BOTTLE_ML = 750;

/** Personas que rinde un volumen total (ml) sirviendo `ouncesPerPerson` onzas a cada una. */
export function peopleServed(totalMl: number, ouncesPerPerson = OUNCES_PER_PERSON): number {
  if (totalMl <= 0 || ouncesPerPerson <= 0) return 0;
  const totalOunces = totalMl / ML_PER_OUNCE;
  return Math.floor(totalOunces / ouncesPerPerson);
}

/** Personas que rinde una cantidad de botellas de cierto volumen. */
export function peoplePerBottles(
  bottles: number,
  bottleMl = DEFAULT_BOTTLE_ML,
  ouncesPerPerson = OUNCES_PER_PERSON,
): number {
  return peopleServed(bottles * bottleMl, ouncesPerPerson);
}
