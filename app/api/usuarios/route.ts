// POST /api/usuarios — dar de alta un usuario (solo admin).
//
// Crea el usuario en Supabase Auth (service_role) con una contraseña temporal
// y su fila en sales_reps con rol, región y módulos visibles.

import { NextResponse } from "next/server";
import { getCurrentRep } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ALL_MODULE_KEYS, isValidRole, type UserRole } from "@/lib/modules";

type Body = {
  email: string;
  full_name: string;
  role: UserRole;
  primary_region?: string | null;
  password: string;
  modules?: string[] | null;
};

export async function POST(req: Request) {
  const me = await getCurrentRep();
  if (!me) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (me.role !== "admin") return NextResponse.json({ error: "Solo admin" }, { status: 403 });

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase();
  const full_name = body.full_name?.trim();
  const role: UserRole = isValidRole(body.role) ? body.role : "rep";
  if (!email || !/.+@.+\..+/.test(email)) return NextResponse.json({ error: "Email inválido" }, { status: 400 });
  if (!full_name) return NextResponse.json({ error: "Nombre requerido" }, { status: 400 });
  if (!body.password || body.password.length < 8) {
    return NextResponse.json({ error: "La contraseña temporal debe tener al menos 8 caracteres" }, { status: 400 });
  }

  // Módulos: para no-admin, validar contra el catálogo; para admin, null (ve todo).
  let modules: string[] | null = null;
  if (role !== "admin") {
    const sel = Array.isArray(body.modules) ? body.modules.filter((k) => ALL_MODULE_KEYS.includes(k)) : null;
    modules = sel; // null = todos los estándar por defecto
  }

  const admin = supabaseAdmin();

  // 1) Crear en Auth.
  const { data: created, error: authErr } = await admin.auth.admin.createUser({
    email,
    password: body.password,
    email_confirm: true,
  });
  if (authErr || !created?.user) {
    return NextResponse.json(
      { error: authErr?.message ?? "No se pudo crear el usuario en Auth" },
      { status: 400 },
    );
  }

  // 2) Crear fila en sales_reps.
  const { error: repErr } = await admin.from("sales_reps").insert({
    auth_user_id: created.user.id,
    email,
    full_name,
    role,
    primary_region: body.primary_region || null,
    modules,
    active: true,
  });
  if (repErr) {
    // Rollback del usuario de Auth para no dejar huérfano.
    await admin.auth.admin.deleteUser(created.user.id).catch(() => {});
    return NextResponse.json({ error: repErr.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
