// Bodegas físicas donde se resguardan las botellas de muestra del banco.
// Es una dimensión distinta de la zona de ventas (region) de la cuenta.
export const SAMPLE_LOCATIONS = [
  "Bodega San José",
  "Bodega La Paz",
  "Bodega Vallarta",
  "Bodega Tijuana",
] as const;

export type SampleLocation = (typeof SAMPLE_LOCATIONS)[number];
