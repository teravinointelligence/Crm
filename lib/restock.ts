// Modelo de reabasto — SIMPLE y EXPLICABLE (promedio móvil + punto de reorden).
// Sin ML. Todo el cálculo vive aquí (puro, testeable con `node --test`); las
// vistas SQL solo aportan la velocidad de venta y el stock crudos.
//
//   velocidad (u/mes)  →  promedio de unidades vendidas (ventana móvil)
//   punto de reorden   →  consumo durante (lead time + colchón de seguridad)
//   riesgo de quiebre  →  stock <= punto de reorden
//   cantidad sugerida  →  llevar el stock al objetivo (lead + cobertura meta)
//   fecha límite       →  cuándo, a más tardar, hay que poner el pedido

/** Parámetros del modelo. Ajustables sin tocar la lógica. */
export const RESTOCK_PARAMS = {
  lookbackMonths: 3, // ventana del promedio móvil de ventas
  defaultLeadDays: 30, // lead time del proveedor si el producto no lo define
  safetyDays: 7, // colchón de seguridad sobre el lead time
  targetCoverDays: 30, // cobertura objetivo de stock tras reabastecer
} as const;

export type RestockUrgency = "agotado" | "critico" | "pronto" | "normal" | "sin_riesgo";

export const URGENCY_LABEL: Record<RestockUrgency, string> = {
  agotado: "Agotado",
  critico: "Pedir ya",
  pronto: "Pedir pronto",
  normal: "En riesgo",
  sin_riesgo: "OK",
};

export const URGENCY_RANK: Record<RestockUrgency, number> = {
  agotado: 0,
  critico: 1,
  pronto: 2,
  normal: 3,
  sin_riesgo: 4,
};

export type ReorderInput = {
  product_id: string;
  sku: string | null;
  name: string;
  supplier: string | null;
  stock: number | null;
  /** Unidades/mes vendidas (promedio móvil ya calculado por la vista). */
  velocityPerMonth: number | null;
  /** Lead time del proveedor (días); null usa el default. */
  leadDays: number | null;
};

export type ReorderResult = ReorderInput & {
  stock: number;
  velocityPerMonth: number;
  velocityPerDay: number;
  leadDays: number;
  daysOfCover: number | null; // null = sin ventas (cobertura infinita)
  reorderPoint: number;
  targetStock: number;
  suggestedQty: number;
  /** Días desde hoy para poner el pedido (negativo = atrasado). null si no aplica. */
  orderByInDays: number | null;
  atRisk: boolean;
  urgency: RestockUrgency;
  reason: string;
};

type Params = typeof RESTOCK_PARAMS;

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Calcula el reabasto de un producto. Determinístico y explicable. */
export function computeReorder(input: ReorderInput, params: Params = RESTOCK_PARAMS): ReorderResult {
  const stock = Math.max(0, Number(input.stock ?? 0));
  const velocityPerMonth = Math.max(0, Number(input.velocityPerMonth ?? 0));
  const leadDays = input.leadDays != null && input.leadDays > 0 ? input.leadDays : params.defaultLeadDays;
  const velocityPerDay = velocityPerMonth / 30;

  // Sin historial de ventas: no hay base para sugerir reabasto.
  if (velocityPerMonth <= 0) {
    return {
      ...input,
      stock,
      velocityPerMonth,
      velocityPerDay: 0,
      leadDays,
      daysOfCover: null,
      reorderPoint: 0,
      targetStock: 0,
      suggestedQty: 0,
      orderByInDays: null,
      atRisk: false,
      urgency: "sin_riesgo",
      reason: "Sin ventas en la ventana reciente — no se sugiere reabasto.",
    };
  }

  const daysOfCover = stock / velocityPerDay;
  const reorderPoint = velocityPerDay * (leadDays + params.safetyDays);
  const targetStock = velocityPerDay * (leadDays + params.targetCoverDays);
  const suggestedQty = Math.max(0, Math.ceil(targetStock - stock));
  // Cuándo hay que pedir: cuando la cobertura baje al lead time + colchón.
  const orderByInDays = Math.floor(daysOfCover - (leadDays + params.safetyDays));

  const atRisk = stock <= reorderPoint && suggestedQty > 0;

  let urgency: RestockUrgency = "sin_riesgo";
  if (atRisk) {
    if (stock <= 0) urgency = "agotado";
    else if (orderByInDays <= 0) urgency = "critico";
    else if (orderByInDays <= 7) urgency = "pronto";
    else urgency = "normal";
  }

  const coverTxt = `${Math.round(daysOfCover)} días de cobertura`;
  const fechaTxt =
    !atRisk
      ? ""
      : orderByInDays <= 0
        ? " · pedir YA (atrasado)"
        : ` · pedir en ≤${orderByInDays} días`;
  const reason = `Vende ~${round1(velocityPerMonth)}/mes · ${stock} en stock · ${coverTxt} · lead ${leadDays}d${fechaTxt}`;

  return {
    ...input,
    stock,
    velocityPerMonth,
    velocityPerDay,
    leadDays,
    daysOfCover,
    reorderPoint,
    targetStock,
    suggestedQty,
    orderByInDays,
    atRisk,
    urgency,
    reason,
  };
}

/** Conveniencia: calcula todos y devuelve solo los productos en riesgo, ordenados. */
export function buildRestockSuggestions(
  inputs: ReorderInput[],
  params: Params = RESTOCK_PARAMS,
): ReorderResult[] {
  return inputs
    .map((i) => computeReorder(i, params))
    .filter((r) => r.atRisk)
    .sort(
      (a, b) =>
        URGENCY_RANK[a.urgency] - URGENCY_RANK[b.urgency] ||
        (a.orderByInDays ?? 0) - (b.orderByInDays ?? 0),
    );
}
