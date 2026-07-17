// Filtro de periodo compartido entre /reportes y /tablero.
//
// Las ventas viven a nivel mes (monthly_sales.period = primer día del mes),
// así que todos los rangos se expresan en meses completos, no en días sueltos.
// Extraído de app/(app)/reportes/page.tsx para no duplicar la lógica; /tablero
// añade la opción "mes" (mes actual) que Reportes no usa.

export type Period = "mes" | "m3" | "m6" | "ytd" | string; // string = año YYYY

export type PeriodRange = {
  fromMonth: string; // YYYY-MM-01
  toMonth: string; // YYYY-MM-01
  label: string;
  /** # de meses del rango (para escalar metas mensuales). */
  months: number;
};

export function monthISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

const MESES_CORTOS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

export function labelMonth(periodISO: string): string {
  const [y, m] = periodISO.split("-").map(Number);
  return `${MESES_CORTOS[m - 1]} ${y}`;
}

function monthsBetween(fromMonth: string, toMonth: string): number {
  const [fy, fm] = fromMonth.split("-").map(Number);
  const [ty, tm] = toMonth.split("-").map(Number);
  return (ty - fy) * 12 + (tm - fm) + 1;
}

export function rangeFor(period: Period): PeriodRange {
  const now = new Date();
  const thisMonth = monthISO(now);
  if (period === "mes") {
    return { fromMonth: thisMonth, toMonth: thisMonth, label: "Mes actual", months: 1 };
  }
  if (period === "m3" || period === "m6") {
    const back = period === "m3" ? 2 : 5;
    const d = new Date(now.getFullYear(), now.getMonth() - back, 1);
    const fromMonth = monthISO(d);
    return { fromMonth, toMonth: thisMonth, label: `Últimos ${back + 1} meses`, months: back + 1 };
  }
  const yMatch = /^(\d{4})$/.exec(period);
  if (yMatch) {
    const y = Number(yMatch[1]);
    return { fromMonth: `${y}-01-01`, toMonth: `${y}-12-01`, label: `Año ${y}`, months: 12 };
  }
  // ytd (y cualquier valor desconocido)
  const y = now.getFullYear();
  const fromMonth = `${y}-01-01`;
  return {
    fromMonth,
    toMonth: thisMonth,
    label: `Año ${y} (a la fecha)`,
    months: monthsBetween(fromMonth, thisMonth),
  };
}

/** Rango inmediatamente anterior, del mismo largo (para variación vs periodo previo). */
export function previousRange(range: PeriodRange): { fromMonth: string; toMonth: string } {
  const [fy, fm] = range.fromMonth.split("-").map(Number);
  const from = new Date(fy, fm - 1 - range.months, 1);
  const to = new Date(fy, fm - 2, 1);
  return { fromMonth: monthISO(from), toMonth: monthISO(to) };
}
