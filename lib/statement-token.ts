// Tokens de acceso público al estado de cuenta (tabla statement_tokens).
// Se crean desde el webhook de correo entrante cuando el remitente coincide,
// de forma única, con un contacto registrado. Se resuelven desde las rutas
// públicas /estado/[token] y /api/estado/[token]/pdf. Todo con service-role.
import "server-only";
import crypto from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

const DEFAULT_TTL_DAYS = 7;

function ttlDays(): number {
  const n = Number(process.env.STATEMENT_TOKEN_TTL_DAYS);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_TTL_DAYS;
}

/**
 * Crea un token de acceso para una cuenta. Devuelve el token (secreto) listo
 * para incrustar en la URL. `admin` debe ser un cliente service-role.
 */
export async function createStatementToken(
  admin: SupabaseClient,
  accountId: string,
  opts: { forEmail?: string | null; source?: string } = {},
): Promise<string> {
  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + ttlDays() * 24 * 60 * 60 * 1000).toISOString();
  const { error } = await admin.from("statement_tokens").insert({
    token,
    account_id: accountId,
    source: opts.source ?? "inbound",
    created_for_email: opts.forEmail ?? null,
    expires_at: expiresAt,
  });
  if (error) throw new Error(`No se pudo crear el token de estado de cuenta: ${error.message}`);
  return token;
}

/**
 * Resuelve un token a su account_id, validando que no esté expirado ni
 * revocado. Si es válido, registra el acceso (last_accessed_at, access_count).
 * Devuelve null si el token no existe o ya no es válido.
 */
export async function resolveStatementToken(
  admin: SupabaseClient,
  token: string,
): Promise<{ accountId: string } | null> {
  if (!token) return null;
  const { data } = await admin
    .from("statement_tokens")
    .select("id, account_id, expires_at, revoked_at, access_count")
    .eq("token", token)
    .maybeSingle();
  if (!data) return null;
  if (data.revoked_at) return null;
  if (new Date(data.expires_at as string).getTime() < Date.now()) return null;

  // Registrar el acceso (best-effort; no bloquea la resolución).
  await admin
    .from("statement_tokens")
    .update({
      last_accessed_at: new Date().toISOString(),
      access_count: Number(data.access_count ?? 0) + 1,
    })
    .eq("id", data.id);

  return { accountId: data.account_id as string };
}

/**
 * Busca a qué cuenta(s) pertenece un correo entre los contactos registrados.
 * Devuelve los account_id distintos. Vacío = remitente desconocido;
 * 1 = match único (emitimos link); >1 = ambiguo (no emitimos link).
 */
export async function accountsForEmail(
  admin: SupabaseClient,
  email: string,
): Promise<string[]> {
  const clean = email.trim().toLowerCase();
  if (!clean.includes("@")) return [];
  const { data } = await admin
    .from("contacts")
    .select("account_id")
    .ilike("email", clean)
    .not("account_id", "is", null);
  const ids = new Set<string>();
  for (const r of (data ?? []) as { account_id: string | null }[]) {
    if (r.account_id) ids.add(r.account_id);
  }
  return [...ids];
}
