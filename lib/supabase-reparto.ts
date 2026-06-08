// Cliente Supabase para el dominio "Reparto". SERVER-ONLY.
//
// Tras la consolidación, Reparto vive dentro de la BD principal del CRM
// (proyecto teravino-crm) en el esquema dedicado `reparto`. Este cliente usa el
// service_role del CRM con `db.schema = "reparto"`, por lo que todas las queries
// `.from("pedidos")`, `.from("clientes")`, `.from("usuarios")`, etc. resuelven a
// `reparto.*` sin cambios en los consumidores.
//
// Inicialización LAZY: importar el módulo no falla si faltan env vars; solo al
// usar el cliente por primera vez se valida y se lanza un error claro.

import { createClient } from "@supabase/supabase-js";

let _client: ReturnType<typeof build> | null = null;

function build() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      "Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el entorno (Vercel → Settings → Environment Variables).",
    );
  }
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: "reparto" },
  });
}

// Proxy: cualquier acceso (.from, .auth, .storage, etc.) construye el cliente la
// primera vez. Si las env vars están bien, todo funciona idéntico al cliente real.
export const repartoAdmin = new Proxy({} as ReturnType<typeof build>, {
  get(_target, prop) {
    if (!_client) _client = build();
    const value = Reflect.get(_client, prop, _client);
    return typeof value === "function" ? value.bind(_client) : value;
  },
});

export const REPARTO_PUBLIC_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
