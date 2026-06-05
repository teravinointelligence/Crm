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

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium",
  }).format(d);
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);
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
