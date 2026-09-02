// Historial mensual de compra por producto y alertas de abandono.
// Módulo puro: recibe ventas/partidas ya autorizadas por RLS y devuelve datos
// serializables para el dashboard de la cuenta.

export type ProductPurchaseStatus = "active" | "watch" | "stopped" | "occasional";

export type ProductPurchasePeriod = {
  period: string;
  detailAvailable: boolean;
  inProgress: boolean;
};

export type ProductPurchaseMonth = ProductPurchasePeriod & {
  units: number;
  amount: number;
};

export type ProductPurchaseRow = {
  key: string;
  code: string | null;
  name: string;
  status: ProductPurchaseStatus;
  encartado: boolean;
  lastPurchasePeriod: string | null;
  monthsSinceLastPurchase: number | null;
  purchaseMonths: number;
  months: ProductPurchaseMonth[];
};

export type ProductPurchaseTimeline = {
  periods: ProductPurchasePeriod[];
  products: ProductPurchaseRow[];
  latestDetailedClosedPeriod: string | null;
};

type Sale = { id: string; period: string };
type SaleItem = {
  monthly_sale_id: string;
  codigo: string | null;
  producto_nombre: string;
  cantidad: number | null;
  total: number | null;
};

export type ProductPurchaseTimelineInput = {
  sales: Sale[];
  items: SaleItem[];
  allPeriods: string[];
  detailedPeriods: string[];
  encartadoCodes?: string[];
  currentPeriod: string;
  displayMonths?: number;
};

const STATUS_RANK: Record<ProductPurchaseStatus, number> = {
  stopped: 0,
  watch: 1,
  active: 2,
  occasional: 3,
};

function periodKey(value: string): string | null {
  const match = /^(\d{4})-(\d{2})/.exec(value);
  if (!match) return null;
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  return `${match[1]}-${match[2]}-01`;
}

function productCode(value: string | null | undefined): string | null {
  const normalized = value?.trim().toUpperCase();
  return normalized || null;
}

function productName(value: string | null | undefined, fallback: string): string {
  return value?.trim().replace(/\s+/g, " ") || fallback;
}

function nameKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

function monthRange(endPeriod: string, count: number): string[] {
  const [year, month] = endPeriod.split("-").map(Number);
  const endIndex = year * 12 + month - 1;
  return Array.from({ length: count }, (_, index) => {
    const absolute = endIndex - (count - 1 - index);
    const y = Math.floor(absolute / 12);
    const m = (absolute % 12) + 1;
    return `${y}-${String(m).padStart(2, "0")}-01`;
  });
}

function bought(value: { units: number; amount: number } | undefined): boolean {
  return Boolean(value && (value.units > 0 || value.amount > 0));
}

/**
 * Alerta conservadora:
 * - amarillo: compró al menos 2 de sus 3 meses comparables anteriores y falta 1;
 * - rojo: el mismo patrón regular ya acumula 2+ meses comparables sin compra;
 * - meses sin detalle y el mes en curso no cuentan como ausencias.
 */
export function buildProductPurchaseTimeline(
  input: ProductPurchaseTimelineInput,
): ProductPurchaseTimeline {
  const displayMonths = Math.max(1, input.displayMonths ?? 12);
  const currentPeriod = periodKey(input.currentPeriod) ?? input.currentPeriod;
  const salePeriod = new Map<string, string>();
  for (const sale of input.sales) {
    const period = periodKey(sale.period);
    if (period) salePeriod.set(sale.id, period);
  }

  const detailed = new Set(
    input.detailedPeriods.map(periodKey).filter((p): p is string => Boolean(p)),
  );
  const known = new Set(
    input.allPeriods.map(periodKey).filter((p): p is string => Boolean(p)),
  );
  for (const period of salePeriod.values()) known.add(period);
  for (const period of detailed) known.add(period);

  type Aggregate = {
    key: string;
    code: string | null;
    name: string;
    namePeriod: string;
    byPeriod: Map<string, { units: number; amount: number }>;
  };
  const products = new Map<string, Aggregate>();

  for (const item of input.items) {
    const period = salePeriod.get(item.monthly_sale_id);
    if (!period) continue;
    known.add(period);
    // La presencia de una partida es evidencia directa de que ese periodo sí
    // tiene desglose, incluso para meses históricos anteriores a sales_imports.
    detailed.add(period);

    const code = productCode(item.codigo);
    const displayName = productName(item.producto_nombre, code ?? "Producto sin nombre");
    const key = code ? `code:${code}` : `name:${nameKey(displayName)}`;
    const aggregate = products.get(key) ?? {
      key,
      code,
      name: displayName,
      namePeriod: period,
      byPeriod: new Map(),
    };
    if (period >= aggregate.namePeriod) {
      aggregate.name = displayName;
      aggregate.namePeriod = period;
    }
    const previous = aggregate.byPeriod.get(period) ?? { units: 0, amount: 0 };
    previous.units += Number(item.cantidad ?? 0);
    previous.amount += Number(item.total ?? 0);
    aggregate.byPeriod.set(period, previous);
    products.set(key, aggregate);
  }

  const allKnownPeriods = [...known].sort();
  if (!allKnownPeriods.length) {
    return { periods: [], products: [], latestDetailedClosedPeriod: null };
  }

  const endPeriod = allKnownPeriods[allKnownPeriods.length - 1];
  const visiblePeriodKeys = monthRange(endPeriod, displayMonths);
  const periodMeta = visiblePeriodKeys.map((period) => ({
    period,
    detailAvailable: detailed.has(period),
    inProgress: period === currentPeriod,
  }));
  const comparablePeriods = [...detailed]
    .filter((period) => period < currentPeriod)
    .sort();
  const latestDetailedClosedPeriod = comparablePeriods.at(-1) ?? null;
  const encartado = new Set(input.encartadoCodes?.map(productCode).filter((c): c is string => Boolean(c)) ?? []);

  type RankedRow = ProductPurchaseRow & { _visibleTotal: number };
  const rows: RankedRow[] = [...products.values()].map((product) => {
    const purchasePeriods = [...product.byPeriod.entries()]
      .filter(([, value]) => bought(value))
      .map(([period]) => period)
      .sort();
    const currentPurchase = bought(product.byPeriod.get(currentPeriod));
    const purchasedComparableIndexes = comparablePeriods
      .map((period, index) => (bought(product.byPeriod.get(period)) ? index : -1))
      .filter((index) => index >= 0);
    const lastClosedPurchaseIndex = purchasedComparableIndexes.at(-1) ?? -1;
    const lastComparableIndex = comparablePeriods.length - 1;

    let status: ProductPurchaseStatus = "occasional";
    let monthsSinceLastPurchase: number | null = null;
    if (currentPurchase || (lastComparableIndex >= 0 && lastClosedPurchaseIndex === lastComparableIndex)) {
      status = "active";
      monthsSinceLastPurchase = 0;
    } else if (lastClosedPurchaseIndex >= 0) {
      monthsSinceLastPurchase = lastComparableIndex - lastClosedPurchaseIndex;
      const cadenceWindow = comparablePeriods.slice(
        Math.max(0, lastClosedPurchaseIndex - 2),
        lastClosedPurchaseIndex + 1,
      );
      const priorPurchases = cadenceWindow.filter((period) => bought(product.byPeriod.get(period))).length;
      const wasRegular = cadenceWindow.length >= 2 && priorPurchases >= 2;
      if (wasRegular && monthsSinceLastPurchase === 1) status = "watch";
      if (wasRegular && monthsSinceLastPurchase >= 2) status = "stopped";
    }

    const months = periodMeta.map((meta) => {
      const value = product.byPeriod.get(meta.period);
      return {
        ...meta,
        units: value?.units ?? 0,
        amount: value?.amount ?? 0,
      };
    });
    const visibleTotal = months.reduce((sum, month) => sum + Math.max(0, month.amount), 0);

    return {
      key: product.key,
      code: product.code,
      name: product.name,
      status,
      encartado: Boolean(product.code && encartado.has(product.code)),
      lastPurchasePeriod: purchasePeriods.at(-1) ?? null,
      monthsSinceLastPurchase,
      purchaseMonths: purchasePeriods.length,
      months,
      _visibleTotal: visibleTotal,
    };
  });

  rows.sort(
    (a, b) =>
      STATUS_RANK[a.status] - STATUS_RANK[b.status] ||
      Number(b.encartado) - Number(a.encartado) ||
      b._visibleTotal - a._visibleTotal ||
      a.name.localeCompare(b.name, "es"),
  );

  return {
    periods: periodMeta,
    products: rows.map(({ _visibleTotal: _ignored, ...row }) => row),
    latestDetailedClosedPeriod,
  };
}
