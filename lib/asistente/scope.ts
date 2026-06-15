// Candado de alcance por vendedor para el asistente — PURO y testeable (sin DB
// ni server-only). Decide si una consulta debe limitarse a las cuentas propias
// del usuario y aplica el filtro a un query builder (duck-typed con .eq).
//
// Regla: solo admin/contador (canSeeFinance) ven todas las cuentas. Cualquier
// otro rol (vendedor, etc.) queda limitado a `assigned_rep_id = su rep id`.
// Esto es defensa en profundidad además de la RLS de la base de datos.

export type ScopeCtx = { rep: { id: string }; canSeeFinance: boolean };

/** true = el usuario solo puede ver SUS cuentas. */
export function ownScope(ctx: ScopeCtx): boolean {
  return !ctx.canSeeFinance;
}

/** Aplica `.eq("assigned_rep_id", rep.id)` cuando el usuario está acotado.
 *  Q queda sin restricción recursiva (el cast interno evita la instanciación
 *  infinita con los tipos profundos del builder de Supabase). */
export function applyOwnScope<Q>(query: Q, ctx: ScopeCtx): Q {
  if (!ownScope(ctx)) return query;
  return (query as { eq(column: string, value: unknown): Q }).eq("assigned_rep_id", ctx.rep.id);
}
