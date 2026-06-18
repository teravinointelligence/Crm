// Tipo de surtido de un pedido de restock (columna restock_requests.fulfillment,
// migración 0075). Puro, para importarlo desde componentes cliente y servidor.

export const FULFILLMENT_TYPES = ["almacen", "directo_proveedor"] as const;
export type FulfillmentType = (typeof FULFILLMENT_TYPES)[number];

export const FULFILLMENT_LABEL: Record<FulfillmentType, string> = {
  almacen: "Desde almacén (Los Cabos)",
  directo_proveedor: "Directo del proveedor",
};

// Descripción breve para el formulario.
export const FULFILLMENT_HINT: Record<FulfillmentType, string> = {
  almacen: "Se surte desde el almacén de Los Cabos.",
  directo_proveedor: "Pedido directo al proveedor, enviado a tu plaza (sin pasar por Los Cabos).",
};

export const FULFILLMENT_VARIANT: Record<FulfillmentType, "muted" | "accent"> = {
  almacen: "muted",
  directo_proveedor: "accent",
};
