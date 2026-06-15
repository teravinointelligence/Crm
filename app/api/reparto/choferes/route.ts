// GET /api/reparto/choferes — usuarios activos asignables a un pedido.
// Incluye a los choferes de reparto y, además, al resto de usuarios activos
// (admins, ventas) para cuando alguien entrega un pedido personalmente.
// `es_chofer` permite agruparlos/distinguirlos en la UI.

import { NextResponse } from "next/server";
import { repartoAdmin } from "@/lib/supabase-reparto";
import { requireReparto } from "../_lib/guard";

export const dynamic = "force-dynamic";

export async function GET() {
  const { response } = await requireReparto();
  if (response) return response;

  const { data, error } = await repartoAdmin
    .from("usuarios")
    .select("id, nombre, email, telefono, rol, es_chofer, activo")
    .eq("activo", true)
    .order("es_chofer", { ascending: false })
    .order("nombre");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}
