// Cliente Supabase con service_role para operaciones de administración del CRM
// (crear usuarios en Auth, escribir saltándose RLS). SERVER-ONLY.
// Inicialización lazy: si falta la llave, lanza error claro al usar.

import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let _client: SupabaseClient | null = null;

export function supabaseAdmin(): SupabaseClient {
  if (_client) return _client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Falta SUPABASE_SERVICE_ROLE_KEY en el entorno (Vercel → Settings → Environment Variables). " +
        "Se necesita para dar de alta usuarios.",
    );
  }
  _client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _client;
}
