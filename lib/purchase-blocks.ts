// Periodos en que una cuenta NO puede comprar (temporada baja, remodelación,
// crédito suspendido…).
//
// Este archivo es PURO a propósito (no toca Supabase ni el DOM), igual que
// lib/rep-tasks.ts: las reglas de vigencia se prueban con `npm test` y el mismo
// código sirve en el servidor (crons, correos) y en el navegador (el panel de
// la cuenta). La parte que consulta la base vive en lib/account-seguimiento.ts.

/** Por qué la cuenta no puede comprar. */
export type PurchaseBlockReason =
  | "temporada_baja"
  | "remodelacion"
  | "cambio_administracion"
  | "credito_suspendido"
  | "cierre_temporal"
  | "otro";

export const BLOCK_REASON_LABEL: Record<PurchaseBlockReason, string> = {
  temporada_baja: "Temporada baja",
  remodelacion: "Remodelación / obra",
  cambio_administracion: "Cambio de administración",
  credito_suspendido: "Crédito suspendido",
  cierre_temporal: "Cierre temporal",
  otro: "Otro motivo",
};

/** Orden del selector: lo más frecuente primero. */
export const BLOCK_REASONS: PurchaseBlockReason[] = [
  "temporada_baja",
  "remodelacion",
  "cambio_administracion",
  "credito_suspendido",
  "cierre_temporal",
  "otro",
];

export type PurchaseBlock = {
  id: string;
  account_id: string;
  reason: PurchaseBlockReason;
  note: string | null;
  /** Fecha `YYYY-MM-DD` en que arranca la pausa. */
  start_date: string;
  /** `YYYY-MM-DD` o null = sigue abierta, sin fecha de término conocida. */
  end_date: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

/** ¿La pausa cubre ese día? Las fechas son `YYYY-MM-DD`, así que comparar como
 *  texto ya es comparar cronológicamente y no arrastra husos horarios. */
export function isBlockActiveOn(block: Pick<PurchaseBlock, "start_date" | "end_date">, day: string): boolean {
  if (block.start_date > day) return false;
  return block.end_date === null || block.end_date >= day;
}

/**
 * La pausa vigente ese día, o null. Si por lo que sea hay varias encimadas
 * (alguien capturó dos), gana la que termina más tarde: la cuenta sigue sin
 * poder comprar hasta esa fecha, y la abierta (sin fin) manda sobre todas.
 */
export function activeBlockOn<T extends Pick<PurchaseBlock, "start_date" | "end_date">>(
  blocks: T[],
  day: string,
): T | null {
  let best: T | null = null;
  for (const b of blocks) {
    if (!isBlockActiveOn(b, day)) continue;
    if (!best) {
      best = b;
      continue;
    }
    if (best.end_date === null) continue; // ya no hay nada más largo
    if (b.end_date === null || b.end_date > best.end_date) best = b;
  }
  return best;
}

/** Ordena para el panel: primero la vigente, luego las más recientes. */
export function compareBlocks(
  a: Pick<PurchaseBlock, "start_date" | "end_date">,
  b: Pick<PurchaseBlock, "start_date" | "end_date">,
  day: string,
): number {
  const av = isBlockActiveOn(a, day) ? 0 : 1;
  const bv = isBlockActiveOn(b, day) ? 0 : 1;
  if (av !== bv) return av - bv;
  return a.start_date < b.start_date ? 1 : a.start_date > b.start_date ? -1 : 0;
}

/**
 * Texto corto de la pausa para banners y correos.
 * `fmt` formatea una fecha `YYYY-MM-DD`; se inyecta para que este archivo siga
 * siendo puro (en la app se le pasa formatDate).
 */
export function blockLabel(
  block: Pick<PurchaseBlock, "reason" | "start_date" | "end_date">,
  fmt: (day: string) => string = (d) => d,
): string {
  const motivo = BLOCK_REASON_LABEL[block.reason] ?? "Sin compras";
  return block.end_date
    ? `${motivo} · del ${fmt(block.start_date)} al ${fmt(block.end_date)}`
    : `${motivo} · desde el ${fmt(block.start_date)}, sin fecha de reapertura`;
}

/**
 * Ids de las cuentas con una pausa vigente. Lo usan las alertas de churn para
 * no perseguir a un vendedor por una cuenta que hoy tiene prohibido comprarle.
 */
export function blockedAccountIds(
  blocks: Pick<PurchaseBlock, "account_id" | "start_date" | "end_date">[],
  day: string,
): Set<string> {
  const out = new Set<string>();
  for (const b of blocks) if (isBlockActiveOn(b, day)) out.add(b.account_id);
  return out;
}
