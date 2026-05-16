// Cliente Supabase para el proyecto "TERAVINO Reparto". SERVER-ONLY.
// Inicialización LAZY: importar el módulo no falla si faltan env vars; solo al
// usar el cliente por primera vez se valida y se lanza un error claro. Esto evita
// que un /reparto/* tire la app entera durante el primer deploy.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let _client: SupabaseClient | null = null;

function build(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_REPARTO_SUPABASE_URL;
  const serviceKey = process.env.REPARTO_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      "Faltan NEXT_PUBLIC_REPARTO_SUPABASE_URL o REPARTO_SUPABASE_SERVICE_ROLE_KEY en el entorno (Vercel → Settings → Environment Variables).",
    );
  }
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// Proxy: cualquier acceso (.from, .auth, .storage, etc.) construye el cliente la
// primera vez. Si las env vars están bien, todo funciona idéntico al cliente real.
export const repartoAdmin = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    if (!_client) _client = build();
    const value = Reflect.get(_client, prop, _client);
    return typeof value === "function" ? value.bind(_client) : value;
  },
});

export const REPARTO_PUBLIC_URL = process.env.NEXT_PUBLIC_REPARTO_SUPABASE_URL;
