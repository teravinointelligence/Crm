// GET /api/reparto/choferes — lista de choferes activos del proyecto Reparto.

import { NextResponse } from "next/server";
import { repartoAdmin } from "@/lib/supabase-reparto";
import { requireAdmin } from "../_lib/guard";

export const dynamic = "force-dynamic";

export async function GET() {
  const { response } = await requireAdmin();
  if (response) return response;

  const { data, error } = await repartoAdmin
    .from("usuarios")
    .select("id, nombre, email, telefono, rol, es_chofer, activo")
    .eq("es_chofer", true)
    .eq("activo", true)
    .order("nombre");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}
