import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2,
  }).format(value);
}

// Toda la operación de TERAVINO es en Los Cabos (Zona Pacífico de México,
// America/Mazatlan, UTC-7 sin horario de verano). Fijamos esta zona al mostrar
// fechas/horas para que se vean igual sin importar dónde corra el servidor
// (Vercel usa UTC) o el dispositivo.
export const APP_TZ = "America/Mazatlan";

// Detecta fechas "puras" YYYY-MM-DD (sin hora): NO se les aplica zona horaria,
// para no correr el día. El resto son instantes (timestamptz) y sí se muestran
// en hora de Los Cabos.
function isDateOnly(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value.trim());
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  if (typeof value === "string" && isDateOnly(value)) {
    // Fecha pura: fijamos mediodía local para que la zona no la corra de día.
    const d = new Date(`${value}T12:00:00`);
    return new Intl.DateTimeFormat("es-MX", { dateStyle: "medium" }).format(d);
  }
  const d = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeZone: APP_TZ }).format(d);
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: APP_TZ,
  }).format(d);
}

/** Solo la hora (ej. "08:00 p. m.") de un instante, en hora de Los Cabos. */
export function formatTime(value: string | Date | null | undefined): string {
  if (!value) return "";
  const d = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("es-MX", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: APP_TZ,
  }).format(d);
}

/** Clave de día "YYYY-MM-DD" de un instante, en hora de Los Cabos (para el calendario). */
export function dateKeyTz(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  // en-CA formatea como YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: APP_TZ,
  }).format(d);
}

/** Partes de un instante en hora de Los Cabos. */
function partsInAppTz(d: Date): Record<string, string> {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    timeZone: APP_TZ,
  }).formatToParts(d);
  const m: Record<string, string> = {};
  for (const p of parts) m[p.type] = p.value;
  return m;
}

/** ISO (instante) → valor para `<input type="datetime-local">` en hora de Los Cabos. */
export function isoToLocalInput(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  const m = partsInAppTz(d);
  return `${m.year}-${m.month}-${m.day}T${m.hour}:${m.minute}`;
}

/**
 * Valor de `<input type="datetime-local">` (reloj de pared) interpretado en hora
 * de Los Cabos → ISO UTC. Determinista (no depende de la zona del dispositivo).
 */
export function localInputToISO(wall: string): string {
  // Tratamos el reloj de pared como si fuera UTC y corregimos por el offset real
  // de Los Cabos para ese instante (America/Mazatlan es UTC-7 fijo hoy).
  const asUtc = new Date(`${wall}:00Z`);
  const m = partsInAppTz(asUtc);
  const shown = Date.UTC(+m.year, +m.month - 1, +m.day, +m.hour, +m.minute, +m.second);
  const offsetMs = shown - asUtc.getTime(); // cuánto adelanta la zona respecto a UTC
  return new Date(asUtc.getTime() - offsetMs).toISOString();
}

/** Formatea solo día y mes de un cumpleaños, ej. "15 de marzo". */
export function formatBirthday(value: string | null | undefined): string {
  if (!value) return "—";
  // birthday viene como 'YYYY-MM-DD'; fijamos hora local para no correr el día.
  const d = new Date(`${value.slice(0, 10)}T00:00:00`);
  return new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "long" }).format(d);
}

/**
 * Días hasta el próximo cumpleaños (ignorando el año) y banderas de cercanía.
 * Devuelve null si no hay fecha.
 */
export function birthdayInfo(
  value: string | null | undefined,
): { daysUntil: number; isToday: boolean; isSoon: boolean; label: string } | null {
  if (!value) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const b = new Date(`${value.slice(0, 10)}T00:00:00`);
  let month = b.getMonth();
  let day = b.getDate();
  if (month === 1 && day === 29) day = 28; // 29-feb → 28-feb
  let next = new Date(today.getFullYear(), month, day);
  next.setHours(0, 0, 0, 0);
  if (next < today) next = new Date(today.getFullYear() + 1, month, day);
  const daysUntil = Math.round((next.getTime() - today.getTime()) / 86_400_000);
  const isToday = daysUntil === 0;
  const label = isToday
    ? "¡Hoy!"
    : daysUntil === 1
      ? "Mañana"
      : `En ${daysUntil} días`;
  return { daysUntil, isToday, isSoon: daysUntil <= 14, label };
}

export function initials(name: string | null | undefined): string {
  if (!name) return "?";
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}
