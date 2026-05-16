// GET /api/reparto/usuarios — lista usuarios con filtros opcionales.
// POST /api/reparto/usuarios — crea un usuario (opcionalmente con cuenta Auth).

import { NextResponse } from "next/server";
import { repartoAdmin } from "@/lib/supabase-reparto";
import { requireAdmin } from "../_lib/guard";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { response } = await requireAdmin();
  if (response) return response;
  const { searchParams } = new URL(req.url);
  let query = repartoAdmin
    .from("usuarios")
    .select("id, auth_id, nombre, email, rol, telefono, activo, es_chofer, created_at")
    .order("nombre");
  if (searchParams.get("es_chofer") === "true") query = query.eq("es_chofer", true);
  if (searchParams.get("activo") === "true") query = query.eq("activo", true);
  if (searchParams.get("activo") === "false") query = query.eq("activo", false);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

function randomPassword(n = 12) {
  const alphabet = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789@#$%";
  let out = "";
  for (let i = 0; i < n; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

export async function POST(req: Request) {
  const { response } = await requireAdmin();
  if (response) return response;
  const body = await req.json();

  const nombre = String(body?.nombre ?? "").trim();
  const email = String(body?.email ?? "").trim().toLowerCase();
  if (!nombre) return NextResponse.json({ error: "Nombre requerido" }, { status: 400 });
  if (!email) return NextResponse.json({ error: "Email requerido" }, { status: 400 });

  let auth_id: string | null = null;
  let tempPassword: string | null = null;

  if (body?.crear_auth) {
    const pwd = String(body?.password ?? "").trim() || randomPassword();
    // Verificar si ya existe un Auth user con ese email.
    // Supabase no expone find-by-email directo; intentamos crear y si falla por duplicado, lo manejamos.
    const { data: created, error: authErr } = await repartoAdmin.auth.admin.createUser({
      email,
      password: pwd,
      email_confirm: true,
      user_metadata: { nombre },
    });
    if (authErr) {
      const msg = (authErr.message ?? "").toLowerCase();
      // Mensaje claro cuando la llave en Vercel no es realmente la service_role.
      if (msg.includes("invalid api key") || msg.includes("permission denied") || msg.includes("not allowed")) {
        return NextResponse.json({
          error: "El endpoint Auth admin requiere la SERVICE_ROLE key. Verifica que REPARTO_SUPABASE_SERVICE_ROLE_KEY en Vercel tenga la llave service_role (no la anon). Revisa /api/reparto/diag.",
        }, { status: 500 });
      }
      // Si el email ya está registrado, busca y reusa el auth_id.
      if (msg.includes("already") || msg.includes("registered")) {
        const existing = await repartoAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
        const match = existing.data?.users.find((u) => u.email?.toLowerCase() === email);
        if (match) {
          auth_id = match.id;
        } else {
          return NextResponse.json({ error: `Email ya registrado pero no pude localizarlo: ${authErr.message}` }, { status: 500 });
        }
      } else {
        return NextResponse.json({ error: `No pude crear el acceso: ${authErr.message}` }, { status: 500 });
      }
    } else {
      auth_id = created.user?.id ?? null;
      tempPassword = pwd; // devolvemos para que admin la comparta al chofer
    }
  }

  const { data, error } = await repartoAdmin
    .from("usuarios")
    .insert({
      auth_id,
      nombre,
      email,
      telefono: body?.telefono?.trim() || null,
      rol: body?.rol?.trim() || (body?.es_chofer ? "chofer" : "operador"),
      es_chofer: !!body?.es_chofer,
      activo: body?.activo !== false,
    })
    .select("id, nombre, email, telefono, rol, es_chofer, activo, auth_id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data, temp_password: tempPassword });
}
