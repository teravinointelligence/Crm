// PATCH /api/usuarios/[id] — actualiza perfil/rol/región/módulos/activo (solo admin).
// No cambia email/contraseña (eso es flujo de Auth aparte).

import { NextResponse } from "next/server";
import { getCurrentRep } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ALL_MODULE_KEYS, isValidRole, type UserRole } from "@/lib/modules";

type Body = {
  full_name?: string;
  role?: UserRole;
  primary_region?: string | null;
  active?: boolean;
  modules?: string[] | null;
};

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const me = await getCurrentRep();
  if (!me) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (me.role !== "admin") return NextResponse.json({ error: "Solo admin" }, { status: 403 });

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const update: Record<string, unknown> = {};
  if (typeof body.full_name === "string" && body.full_name.trim()) update.full_name = body.full_name.trim();
  if (body.role && isValidRole(body.role)) update.role = body.role;
  if (body.primary_region !== undefined) update.primary_region = body.primary_region || null;
  if (typeof body.active === "boolean") update.active = body.active;
  if (body.modules !== undefined) {
    // Para admin, módulos = null (ve todo). Para no-admin, filtrar contra el catálogo.
    const effectiveRole = update.role ?? undefined;
    if (effectiveRole === "admin") {
      update.modules = null;
    } else {
      update.modules = Array.isArray(body.modules)
        ? body.modules.filter((k) => ALL_MODULE_KEYS.includes(k))
        : null;
    }
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Nada que actualizar" }, { status: 400 });
  }

  const { error } = await supabaseAdmin().from("sales_reps").update(update).eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
