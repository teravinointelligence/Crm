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

/** % máximo de descuento que un vendedor puede aplicar sin autorización admin
 *  (0 = ninguno; cualquier descuento de un vendedor queda pendiente).
 *  Debe coincidir con v_limit del trigger tg_orders_discount (migración 0080). */
export const MAX_VENDOR_DISCOUNT_PCT = 0;

const round2 = (n: number) => Math.round(n * 100) / 100;

export type DiscountStatus = "none" | "pendiente" | "autorizado" | "rechazado";

/** Estado que tomará un descuento al guardarse, según quién lo aplica.
 *  Espejo del trigger: admin → autorizado; no-admin ≤límite → autorizado; arriba → pendiente. */
export function discountStatusFor(pct: number, isAdmin: boolean): DiscountStatus {
  if (!pct || pct <= 0) return "none";
  if (isAdmin) return "autorizado";
  return pct <= MAX_VENDOR_DISCOUNT_PCT ? "autorizado" : "pendiente";
}

/** Totales de una orden dado el subtotal bruto y el descuento. El descuento solo
 *  resta si está autorizado (un pendiente/rechazado no afecta el total). */
export function orderTotals(subtotal: number, pct: number, status: DiscountStatus) {
  const discount = status === "autorizado" ? round2((subtotal * (pct || 0)) / 100) : 0;
  const iva = round2((subtotal - discount) * IVA_RATE);
  return { discount, iva, total: round2(subtotal - discount + iva) };
}

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
