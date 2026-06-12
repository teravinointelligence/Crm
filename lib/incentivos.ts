// Tipos y agregaciones puras del módulo de Incentivos (programa Gerard
// Bertrand 2026 y futuros). El cálculo crudo vive en SQL
// (get_incentive_detail, migración 0054): aquí solo se agrupa/proyecta.
// Sin "server-only": los componentes cliente reutilizan estas funciones.

export type IncentiveProgram = {
  id: string;
  name: string;
  provider: string;
  start_date: string;
  end_date: string;
  active: boolean;
  require_paid: boolean;
  notes: string | null;
};

export type IncentiveLevel = {
  id: string;
  name: string;
  points_required: number;
  reward: string;
  reward_value_mxn: number;
  sort_order: number;
};

// Renglón de get_incentive_detail (una partida de venta GB).
export type IncentiveDetailRow = {
  rep_id: string;
  rep_name: string;
  period: string; // primer día del mes (YYYY-MM-01)
  account_id: string;
  client_number: string | null;
  client_name: string | null;
  codigo: string;
  producto_nombre: string;
  category: string;
  points_per_bottle: number;
  bottles: number;
  points: number;
  cobrado: boolean;
};

export const CATEGORY_ORDER = ["Íconos", "Parcelarias", "Châteaux", "Premium", "Volumen"] as const;
export type Category = (typeof CATEGORY_ORDER)[number];

export const CATEGORY_POINTS: Record<Category, number> = {
  Íconos: 50,
  Parcelarias: 35,
  Châteaux: 10,
  Premium: 5,
  Volumen: 1,
};

// Vinos de referencia para el simulador "¿cuánto me falta?". El programa
// premia mezcla premium: 3 botellas de Clos du Temple valen lo que 150 de
// volumen, y ESO es lo que queremos que el vendedor vea.
export const SIMULATOR_REFS: { label: string; pts: number }[] = [
  { label: "Clos du Temple", pts: 50 },
  { label: "Cigalus", pts: 10 },
  { label: "Premium (Crémant, Aigle, Orange Gold…)", pts: 5 },
  { label: "Volumen (Gris Blanc, Côte des Roses…)", pts: 1 },
];

export type CategoryAgg = { bottles: number; points: number };
export type MonthAgg = { period: string; bottles: number; points: number };

export type RepSummary = {
  repId: string;
  repName: string;
  /** Puntos según la regla del programa (cobrado si require_paid). */
  points: number;
  bottles: number;
  /** Puntos facturados sin filtro de cobranza (siempre ≥ points). */
  pointsFacturado: number;
  bottlesFacturado: number;
  byCategory: Map<string, CategoryAgg>;
  byMonth: MonthAgg[]; // orden cronológico
};

/**
 * Agrupa el detalle por vendedor. `requirePaid` refleja la regla del
 * programa: si es true, los puntos "oficiales" solo cuentan renglones
 * cobrados, y lo facturado-no-cobrado queda como "en camino".
 */
export function summarizeByRep(rows: IncentiveDetailRow[], requirePaid: boolean): RepSummary[] {
  const map = new Map<string, RepSummary>();
  for (const r of rows) {
    let s = map.get(r.rep_id);
    if (!s) {
      s = {
        repId: r.rep_id,
        repName: r.rep_name,
        points: 0,
        bottles: 0,
        pointsFacturado: 0,
        bottlesFacturado: 0,
        byCategory: new Map(),
        byMonth: [],
      };
      map.set(r.rep_id, s);
    }
    const bottles = Number(r.bottles);
    const points = Number(r.points);
    s.pointsFacturado += points;
    s.bottlesFacturado += bottles;
    const counts = !requirePaid || r.cobrado;
    if (counts) {
      s.points += points;
      s.bottles += bottles;
      const cat = s.byCategory.get(r.category) ?? { bottles: 0, points: 0 };
      cat.bottles += bottles;
      cat.points += points;
      s.byCategory.set(r.category, cat);
      const m = s.byMonth.find((x) => x.period === r.period);
      if (m) {
        m.bottles += bottles;
        m.points += points;
      } else {
        s.byMonth.push({ period: r.period, bottles, points });
      }
    }
  }
  for (const s of map.values()) s.byMonth.sort((a, b) => a.period.localeCompare(b.period));
  return [...map.values()].sort((a, b) => b.points - a.points);
}

/** Niveles ya alcanzados (acumulables: se ganan TODOS los <= puntos). */
export function levelsReached(points: number, levels: IncentiveLevel[]): IncentiveLevel[] {
  return levels.filter((l) => points >= l.points_required).sort((a, b) => a.sort_order - b.sort_order);
}

export function currentLevel(points: number, levels: IncentiveLevel[]): IncentiveLevel | null {
  const r = levelsReached(points, levels);
  return r.length ? r[r.length - 1] : null;
}

export function nextLevel(points: number, levels: IncentiveLevel[]): IncentiveLevel | null {
  return (
    levels
      .filter((l) => points < l.points_required)
      .sort((a, b) => a.points_required - b.points_required)[0] ?? null
  );
}

/** Valor MXN acumulado de las recompensas ya ganadas. */
export function rewardValueReached(points: number, levels: IncentiveLevel[]): number {
  return levelsReached(points, levels).reduce((s, l) => s + Number(l.reward_value_mxn), 0);
}

/**
 * Proyección a diciembre: puntos × 12 / meses COMPLETOS transcurridos del
 * periodo del programa. En junio van 5 meses completos (ene–may). Antes de
 * cerrar el primer mes no hay proyección.
 */
export function projectToDecember(
  points: number,
  programStart: string,
  today: Date,
): { points: number; monthsElapsed: number } | null {
  const start = new Date(programStart + "T00:00:00");
  const monthsElapsed =
    (today.getFullYear() - start.getFullYear()) * 12 + (today.getMonth() - start.getMonth());
  if (monthsElapsed <= 0) return null;
  const clamped = Math.min(monthsElapsed, 12);
  return { points: Math.round((points * 12) / clamped), monthsElapsed: clamped };
}

/** Equivalencias hacia el siguiente nivel para el mini-simulador. */
export function simulatorEquivalences(missingPoints: number): { label: string; bottles: number; pts: number }[] {
  if (missingPoints <= 0) return [];
  return SIMULATOR_REFS.map((r) => ({
    label: r.label,
    pts: r.pts,
    bottles: Math.ceil(missingPoints / r.pts),
  }));
}

/** "2026-04-01" → "Abr". */
export function monthLabel(period: string): string {
  const m = Number(period.slice(5, 7));
  return ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"][m - 1] ?? period;
}

/** Eje ene–dic del año del programa, rellenando meses sin venta con 0. */
export function fullYearSeries(byMonth: MonthAgg[], programStart: string): MonthAgg[] {
  const year = programStart.slice(0, 4);
  return Array.from({ length: 12 }, (_, i) => {
    const period = `${year}-${String(i + 1).padStart(2, "0")}-01`;
    const found = byMonth.find((m) => m.period === period);
    return found ?? { period, bottles: 0, points: 0 };
  });
}

// Medallas: tonos premium por nivel (Bronce cobre, Plata perla, Oro de
// marca, Platino frío). Inline-hex porque Tailwind no genera clases dinámicas.
export const LEVEL_SWATCH: Record<string, { solid: string; bg: string; fg: string }> = {
  Bronce: { solid: "#B87333", bg: "#F6E8DC", fg: "#7C4A1E" },
  Plata: { solid: "#9CA3AF", bg: "#F1F2F4", fg: "#52525B" },
  Oro: { solid: "#c9a96e", bg: "#F5EDDD", fg: "#8A6D3B" },
  Platino: { solid: "#7E93A8", bg: "#E8EEF3", fg: "#46586B" },
};

export const NO_LEVEL_LABEL = "Aún no califica";
