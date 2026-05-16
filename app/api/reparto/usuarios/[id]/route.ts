// PATCH /api/reparto/usuarios/[id] — actualiza nombre, teléfono, rol, activo, es_chofer.
// POST .../reset-password no aquí; se maneja desde el dashboard de Supabase por seguridad.

import { NextResponse } from "next/server";
import { repartoAdmin } from "@/lib/supabase-reparto";
import { requireAdmin } from "../../_lib/guard";

export const dynamic = "force-dynamic";

const PATCHABLE = new Set(["nombre", "telefono", "rol", "activo", "es_chofer"]);

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const { response } = await requireAdmin();
  if (response) return response;
  const body = await req.json();

  const update: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body ?? {})) {
    if (!PATCHABLE.has(k)) continue;
    update[k] = v === "" ? null : v;
  }
  if (!Object.keys(update).length) {
    return NextResponse.json({ error: "Nada que actualizar" }, { status: 400 });
  }

  const { data, error } = await repartoAdmin
    .from("usuarios")
    .update(update)
    .eq("id", params.id)
    .select("id, nombre, email, telefono, rol, es_chofer, activo, auth_id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
