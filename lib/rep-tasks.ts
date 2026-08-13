// Reglas y etiquetas de las tareas del vendedor ("Mi día").
//
// Este archivo es PURO a propósito (no toca Supabase ni el DOM): las reglas de
// prioridad y de deduplicación se pueden probar con `npm test`. La parte que
// consulta la base vive en lib/rep-tasks-generate.ts.

import type { RepTaskOutcome, RepTaskSource, RepTaskStatus } from "@/types/database";

// --- Umbrales de las reglas ------------------------------------------------

/** Días sin actividad para que un prospecto entre a seguimiento. */
export const PROSPECT_STALE_DAYS = 14;
/** Días sin actividad para que un cliente activo cuente como inactivo.
 *  Mismo umbral que el recordatorio de "Clientes inactivos" para que el
 *  vendedor no vea dos criterios distintos con el mismo nombre. */
export const INACTIVE_STALE_DAYS = 15;

// --- Etiquetas -------------------------------------------------------------

export const SOURCE_LABEL: Record<RepTaskSource, string> = {
  prospecto: "Prospecto",
  cobranza: "Cobranza",
  inactivo: "Cliente inactivo",
  manual: "Asignada",
};

export const STATUS_LABEL: Record<RepTaskStatus, string> = {
  pendiente: "Pendiente",
  hecha: "Hecha",
  descartada: "Descartada",
  resuelta: "Se resolvió sola",
};

export const OUTCOME_LABEL: Record<RepTaskOutcome, string> = {
  contactado: "Lo contacté",
  no_contesto: "No contestó",
  agendo_cita: "Agendé cita",
  promesa_pago: "Promesa de pago",
  pago_recibido: "Ya pagó",
  sin_interes: "No le interesa",
  no_aplica: "No aplica",
};

/** Resultados que tiene sentido ofrecer al cerrar, según el tipo de tarea. */
export function outcomesForSource(source: RepTaskSource): RepTaskOutcome[] {
  if (source === "cobranza") {
    return ["promesa_pago", "pago_recibido", "contactado", "no_contesto", "no_aplica"];
  }
  if (source === "prospecto" || source === "inactivo") {
    return ["agendo_cita", "contactado", "no_contesto", "sin_interes"];
  }
  return ["contactado", "agendo_cita", "no_contesto", "no_aplica"];
}

// --- Periodos y deduplicación ---------------------------------------------

/**
 * Semana ISO de una fecha `YYYY-MM-DD`, como `YYYY-Www`. Se usa para que una
 * tarea semanal (prospectos, inactivos) vuelva a salir la semana siguiente si
 * el problema sigue, pero no se duplique todos los días.
 */
export function isoWeekKey(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  // Jueves de la misma semana: define el año ISO.
  const dayNum = (d.getUTCDay() + 6) % 7; // lunes = 0
  d.setUTCDate(d.getUTCDate() - dayNum + 3);
  const isoYear = d.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(isoYear, 0, 4));
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
  const week = 1 + Math.round((d.getTime() - firstThursday.getTime()) / (7 * 86_400_000));
  return `${isoYear}-W${String(week).padStart(2, "0")}`;
}

/** Mes de una fecha `YYYY-MM-DD`, como `YYYY-MM`. */
export function monthKey(day: string): string {
  return day.slice(0, 7);
}

/** Cada regla tiene su cadencia: cobranza es mensual, el resto semanal. */
export function periodKeyFor(source: RepTaskSource, day: string): string {
  return source === "cobranza" ? monthKey(day) : isoWeekKey(day);
}

/**
 * Clave de deduplicación `<source>:<account_id>:<periodo>`. El índice único
 * (sales_rep_id, dedupe_key) evita que el cron cree la misma tarea cada día.
 */
export function dedupeKey(source: RepTaskSource, accountId: string, day: string): string {
  return `${source}:${accountId}:${periodKeyFor(source, day)}`;
}

// --- Prioridad -------------------------------------------------------------

function clampPriority(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

// La pendiente es suave y el reloj se topa a 120 días a propósito: con una
// pendiente agresiva casi todas las cuentas se pegaban al 100 y el orden del
// día quedaba prácticamente al azar. Así sí se distinguen entre sí.
const AGE_CAP_DAYS = 120;

/**
 * Prioridad 0–100 de un prospecto olvidado: entre más lleve sin atención, más
 * arriba sale. Arranca alto porque un prospecto sin seguimiento se enfría.
 */
export function prospectPriority(daysAbandoned: number | null): number {
  // Sin fecha de referencia alguna: prioridad media-alta, ni al frente ni al final.
  if (daysAbandoned === null) return 70;
  return clampPriority(50 + Math.min(daysAbandoned, AGE_CAP_DAYS) * 0.4);
}

/** Prioridad 0–100 de un cliente que dejó de recibir atención. */
export function inactivePriority(daysAbandoned: number | null): number {
  if (daysAbandoned === null) return 55;
  return clampPriority(40 + Math.min(daysAbandoned, AGE_CAP_DAYS) * 0.4);
}

/** La cobranza ya trae su propio score explicable (lib/cobranza-score.ts). */
export function cobranzaPriority(score: number): number {
  return clampPriority(score);
}

// --- Orden de la lista del día --------------------------------------------

export type SortableTask = {
  due_date: string;
  priority: number;
  created_at?: string;
};

/**
 * Orden de "Mi día": primero lo vencido (fecha más vieja), y dentro del mismo
 * día lo más urgente. Determinístico para que la lista no baile entre recargas.
 */
export function compareTasks(a: SortableTask, b: SortableTask): number {
  if (a.due_date !== b.due_date) return a.due_date < b.due_date ? -1 : 1;
  if (a.priority !== b.priority) return b.priority - a.priority;
  return (a.created_at ?? "").localeCompare(b.created_at ?? "");
}

/** Días de atraso de una tarea respecto a `today` (0 si no está vencida). */
export function overdueDays(dueDate: string, today: string): number {
  if (dueDate >= today) return 0;
  const diff = Date.parse(`${today}T00:00:00Z`) - Date.parse(`${dueDate}T00:00:00Z`);
  return Math.max(0, Math.round(diff / 86_400_000));
}

/** Suma días a una fecha `YYYY-MM-DD` y devuelve otra fecha `YYYY-MM-DD`. */
export function addDays(day: string, days: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Opciones del menú de "Posponer" (etiqueta → días a sumar). */
export const SNOOZE_OPTIONS: { label: string; days: number }[] = [
  { label: "Mañana", days: 1 },
  { label: "En 3 días", days: 3 },
  { label: "La próxima semana", days: 7 },
];
