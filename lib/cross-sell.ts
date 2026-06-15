// Recomendador de venta cruzada — co-ocurrencia explicable ("clientes que se
// parecen a este compran X y este aún no"). Puro y testeable.
//
// "Parecidos" = cuentas del mismo giro o región que comparten ≥ minShared
// productos con la cuenta objetivo. El score de un candidato = cuántos de esos
// clientes parecidos lo compran. Identidad de producto por código CONTPAQ
// (monthly_sales_items.codigo); no requiere el puente del catálogo (Fase 2).

export type AccountBasket = {
  account_id: string;
  account_type: string | null;
  region: string | null;
  codigos: Set<string>;
};

export const CROSS_SELL_PARAMS = {
  minShared: 2, // productos en común para considerar "parecido"
  topN: 5,
  minSupporters: 2, // al menos N clientes parecidos lo compran
} as const;

export type Recommendation = {
  codigo: string;
  nombre: string;
  supporters: number; // clientes parecidos que lo compran
  similarCount: number; // total de clientes parecidos considerados
  anchors: string[]; // productos en común que sustentan la similitud (nombres)
  reason: string;
};

function sameSegment(a: AccountBasket, b: AccountBasket): boolean {
  return (
    (!!a.account_type && a.account_type === b.account_type) ||
    (!!a.region && a.region === b.region)
  );
}

function overlap(a: Set<string>, b: Set<string>): number {
  let n = 0;
  const [small, big] = a.size < b.size ? [a, b] : [b, a];
  for (const x of small) if (big.has(x)) n += 1;
  return n;
}

export function recommendForAccount(
  targetId: string,
  baskets: AccountBasket[],
  nombreByCodigo: Map<string, string>,
  params = CROSS_SELL_PARAMS,
): Recommendation[] {
  const target = baskets.find((b) => b.account_id === targetId);
  if (!target || !target.codigos.size) return [];

  // Clientes parecidos: mismo segmento + canasta solapada.
  const similar = baskets.filter(
    (b) => b.account_id !== targetId && sameSegment(b, target) && overlap(b.codigos, target.codigos) >= params.minShared,
  );
  if (!similar.length) return [];

  // Candidatos: productos que compran los parecidos y el objetivo NO.
  const supporters = new Map<string, number>();
  for (const s of similar) {
    for (const c of s.codigos) {
      if (!target.codigos.has(c)) supporters.set(c, (supporters.get(c) ?? 0) + 1);
    }
  }

  // Anclas: productos en común más frecuentes entre los parecidos (el "porqué").
  const anchorFreq = new Map<string, number>();
  for (const s of similar) {
    for (const c of target.codigos) if (s.codigos.has(c)) anchorFreq.set(c, (anchorFreq.get(c) ?? 0) + 1);
  }
  const topAnchors = [...anchorFreq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([c]) => nombreByCodigo.get(c) || c);

  return [...supporters.entries()]
    .filter(([, n]) => n >= params.minSupporters)
    .sort((a, b) => b[1] - a[1])
    .slice(0, params.topN)
    .map(([codigo, n]) => ({
      codigo,
      nombre: nombreByCodigo.get(codigo) || codigo,
      supporters: n,
      similarCount: similar.length,
      anchors: topAnchors,
      reason:
        `Lo compran ${n} de ${similar.length} clientes parecidos (mismo giro/región)` +
        (topAnchors.length ? `, que también compran ${topAnchors.join(" y ")}.` : "."),
    }));
}
