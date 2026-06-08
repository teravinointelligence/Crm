// Categorías de gasto de bodegas (rentas + mantenimiento) para etiquetar los
// cargos del estado de cuenta. Alcance acotado: 4 bodegas + mantenimiento de
// Vallarta y San José del Cabo.

import { payerSignature } from "./aliases";

export type BodegaCategoria = {
  key: string;
  label: string;
  tipo: "renta" | "mantenimiento";
  bodega: "Tijuana" | "San José del Cabo" | "Vallarta" | "La Paz";
};

export const BODEGA_CATEGORIAS: BodegaCategoria[] = [
  { key: "renta_tijuana", label: "Renta — Tijuana", tipo: "renta", bodega: "Tijuana" },
  { key: "renta_sjc", label: "Renta — San José del Cabo", tipo: "renta", bodega: "San José del Cabo" },
  { key: "renta_vallarta", label: "Renta — Vallarta", tipo: "renta", bodega: "Vallarta" },
  { key: "renta_lapaz", label: "Renta — La Paz", tipo: "renta", bodega: "La Paz" },
  { key: "mant_vallarta", label: "Mantenimiento — Vallarta", tipo: "mantenimiento", bodega: "Vallarta" },
  { key: "mant_sjc", label: "Mantenimiento — San José del Cabo", tipo: "mantenimiento", bodega: "San José del Cabo" },
];

export const BODEGA_LABEL: Record<string, string> = Object.fromEntries(
  BODEGA_CATEGORIAS.map((c) => [c.key, c.label]),
);

export function isBodegaCategoria(key: string): boolean {
  return key in BODEGA_LABEL;
}

/** Llave de regla aprendida para un cargo: firma del concepto + monto.
 *  El monto distingue una bodega de otra (el concepto no las nombra). */
export function cargoMatchKey(description: string, reference: string | null, amount: number): string {
  return `${payerSignature(description, reference)}|${amount.toFixed(2)}`;
}
