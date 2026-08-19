// Carga del panel de seguimiento de la cuenta: bitácora de notas y periodos en
// que la cuenta no puede comprar. SERVER-ONLY.
//
// Las reglas puras (vigencia, etiquetas) están en lib/purchase-blocks.ts; aquí
// solo vive lo que habla con Supabase. Acepta tanto el cliente con cookies
// (RLS acota al vendedor) como el service-role de los crons.

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { createClient } from "@/lib/supabase/server";
import { activeBlockOn, type PurchaseBlock } from "@/lib/purchase-blocks";
import { dateKeyTz } from "@/lib/utils";
import type { AccountNote, AccountNoteWithAuthor } from "@/types/database";

type DbClient = ReturnType<typeof createClient> | SupabaseClient;

/** Cuántas notas se traen al panel de la cuenta. */
export const ACCOUNT_NOTES_LIMIT = 50;

/** Notas de la cuenta, fijadas primero, con el nombre del autor resuelto. */
export async function loadAccountNotes(
  supabase: DbClient,
  accountId: string,
  limit = ACCOUNT_NOTES_LIMIT,
): Promise<AccountNoteWithAuthor[]> {
  const { data } = await supabase
    .from("account_notes")
    .select("*")
    .eq("account_id", accountId)
    .order("pinned", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  const notes = (data ?? []) as AccountNote[];
  if (!notes.length) return [];

  const repIds = [...new Set(notes.map((n) => n.sales_rep_id).filter(Boolean))] as string[];
  const nameById = new Map<string, string>();
  if (repIds.length) {
    const { data: reps } = await supabase
      .from("sales_reps")
      .select("id, full_name")
      .in("id", repIds);
    for (const r of (reps ?? []) as { id: string; full_name: string | null }[]) {
      if (r.full_name) nameById.set(r.id, r.full_name);
    }
  }

  return notes.map((n) => ({
    ...n,
    author_name: n.sales_rep_id ? (nameById.get(n.sales_rep_id) ?? null) : null,
  }));
}

/** Todos los periodos sin compras de una cuenta (vigentes e históricos). */
export async function loadAccountBlocks(
  supabase: DbClient,
  accountId: string,
): Promise<PurchaseBlock[]> {
  const { data } = await supabase
    .from("account_purchase_blocks")
    .select("*")
    .eq("account_id", accountId)
    .order("start_date", { ascending: false });
  return (data ?? []) as PurchaseBlock[];
}

/** Lo mínimo que necesitan las alertas para saber que una cuenta está en pausa. */
export type ActiveBlock = Pick<
  PurchaseBlock,
  "account_id" | "reason" | "start_date" | "end_date"
>;

/**
 * Pausa vigente hoy por cuenta. Lo usan las alertas de churn y el generador de
 * tareas para no perseguir al vendedor por una cuenta que tiene prohibido
 * comprar, y para poder decir POR QUÉ está en pausa.
 *
 * Si la tabla todavía no existe (migración 0101 sin aplicar) devuelve un mapa
 * vacío: preferimos que las alertas sigan saliendo como antes a que el cron
 * truene entero.
 */
export async function loadActiveBlockByAccount(
  supabase: DbClient,
  day: string = dateKeyTz(new Date()),
): Promise<Map<string, ActiveBlock>> {
  const { data, error } = await supabase
    .from("account_purchase_blocks")
    .select("account_id, reason, start_date, end_date")
    .lte("start_date", day)
    .or(`end_date.is.null,end_date.gte.${day}`);
  if (error) return new Map();

  // Una cuenta puede traer varias pausas encimadas; activeBlockOn decide cuál
  // manda (la que termina más tarde, y la abierta sobre todas).
  const byAccount = new Map<string, ActiveBlock[]>();
  for (const b of (data ?? []) as ActiveBlock[]) {
    const list = byAccount.get(b.account_id);
    if (list) list.push(b);
    else byAccount.set(b.account_id, [b]);
  }

  const out = new Map<string, ActiveBlock>();
  for (const [accountId, list] of byAccount) {
    const active = activeBlockOn(list, day);
    if (active) out.set(accountId, active);
  }
  return out;
}

/** Solo los ids, cuando el motivo no hace falta. */
export async function loadBlockedAccountIds(
  supabase: DbClient,
  day: string = dateKeyTz(new Date()),
): Promise<Set<string>> {
  return new Set((await loadActiveBlockByAccount(supabase, day)).keys());
}
