// Helpers puros del asistente (sin DB) para poder testearlos.

export type PeriodUnits = { codigo: string; nombre: string; period: string; total: number };

export type ProductDecline = {
  codigo: string;
  nombre: string;
  prev: number;
  last: number;
  dropPct: number; // fracción de caída (0..1)
};

/**
 * Calcula la caída mes vs mes por producto: compara el último periodo global
 * contra el anterior. Solo devuelve los que cayeron (dropPct > 0) y que tenían
 * venta material en el periodo previo.
 */
export function productDeclines(rows: PeriodUnits[], minPrev = 1): ProductDecline[] {
  const periods = [...new Set(rows.map((r) => r.period))].sort();
  if (periods.length < 2) return [];
  const last = periods[periods.length - 1];
  const prev = periods[periods.length - 2];

  const byCodigo = new Map<string, { nombre: string; prev: number; last: number }>();
  for (const r of rows) {
    const e = byCodigo.get(r.codigo) ?? { nombre: r.nombre, prev: 0, last: 0 };
    if (r.period === last) e.last += r.total;
    else if (r.period === prev) e.prev += r.total;
    byCodigo.set(r.codigo, e);
  }

  const out: ProductDecline[] = [];
  for (const [codigo, e] of byCodigo) {
    if (e.prev < minPrev) continue;
    if (e.last >= e.prev) continue;
    out.push({ codigo, nombre: e.nombre, prev: e.prev, last: e.last, dropPct: (e.prev - e.last) / e.prev });
  }
  return out.sort((a, b) => b.dropPct - a.dropPct);
}

/** Normaliza texto para buscar cuentas por nombre (sin acentos, minúsculas). */
export function normForSearch(s: string | null | undefined): string {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}
