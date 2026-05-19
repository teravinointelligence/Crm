// GET /api/consignaciones/choferes
//
// Lista de choferes del proyecto Reparto, disponible para admin y reps del
// CRM. A diferencia de /api/reparto/choferes (admin-only, expone email/teléfono),
// este endpoint devuelve SOLO id+nombre — lo mínimo necesario para que un
// vendedor pueda asignar un chofer a su consignación.

import { NextResponse } from "next/server";
import { getCurrentRep } from "@/lib/auth";
import { repartoAdmin } from "@/lib/supabase-reparto";

export const dynamic = "force-dynamic";

export async function GET() {
  const rep = await getCurrentRep();
  if (!rep) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { data, error } = await repartoAdmin
    .from("usuarios")
    .select("id, nombre")
    .eq("es_chofer", true)
    .eq("activo", true)
    .order("nombre");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}
