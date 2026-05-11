import type { PriceTier, Region } from "@/types/database";

export const REGION_TIER: Record<Region, PriceTier> = {
  "Los Cabos": "base",
  "Puerto Vallarta": "base",
  Nayarit: "base",
  "Todos Santos": "base",
  "La Paz": "+10",
  Tijuana: "+10",
};

export const IVA_RATE = 0.16;
export const PLUS_10_FACTOR = 1.1;

const round2 = (n: number) => Math.round(n * 100) / 100;

export function applyRegionPrice(basePrice: number, tier: PriceTier): number {
  return tier === "+10" ? round2(basePrice * PLUS_10_FACTOR) : round2(basePrice);
}

export function tierForRegion(region: Region | null | undefined): PriceTier {
  if (!region) return "base";
  return REGION_TIER[region] ?? "base";
}

export function withIVA(subtotal: number): number {
  return round2(subtotal * (1 + IVA_RATE));
}

export function ivaAmount(subtotal: number): number {
  return round2(subtotal * IVA_RATE);
}
