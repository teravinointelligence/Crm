// Almacenes físicos de TERAVINO. Debe coincidir con el check de
// product_warehouse_stock (migración 0050).
export const WAREHOUSES = [
  "La Paz",
  "V612",
  "Tijuana",
  "Vallarta",
  "Los Cabos",
] as const;

export type Warehouse = (typeof WAREHOUSES)[number];

// Abreviaturas para el desglose compacto en tablas.
export const WAREHOUSE_SHORT: Record<Warehouse, string> = {
  "La Paz": "LAP",
  V612: "V612",
  Tijuana: "TIJ",
  Vallarta: "VTA",
  "Los Cabos": "CAB",
};

// Almacén predeterminado por región del vendedor.
export const REGION_WAREHOUSE: Record<string, Warehouse> = {
  "La Paz": "La Paz",
  "Los Cabos": "Los Cabos",
  Tijuana: "Tijuana",
  "Puerto Vallarta": "Vallarta",
  Nayarit: "Vallarta",
  Vallarta: "Vallarta",
};

export function warehouseForRegion(region: string | null | undefined): Warehouse | null {
  if (!region) return null;
  return REGION_WAREHOUSE[region] ?? null;
}

export type WarehouseStock = {
  product_id: string;
  warehouse: Warehouse;
  stock_quantity: number;
  last_update: string;
  last_source: string | null;
};
