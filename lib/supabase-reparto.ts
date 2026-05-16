// Cliente Supabase para el proyecto "TERAVINO Reparto". SERVER-ONLY.
// Usa la service_role key para saltarse la RLS del proyecto secundario; la
// autorización del CRM (admin) se valida antes de invocarlo en cada API route.

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_REPARTO_SUPABASE_URL;
const serviceKey = process.env.REPARTO_SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  throw new Error(
    "Faltan NEXT_PUBLIC_REPARTO_SUPABASE_URL o REPARTO_SUPABASE_SERVICE_ROLE_KEY en el entorno.",
  );
}

export const repartoAdmin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export const REPARTO_PUBLIC_URL = url;
