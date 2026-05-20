// GET /api/consignaciones/reparto-clientes?q=
//
// Búsqueda de clientes del proyecto Reparto, accesible a admin y reps del CRM
// (a diferencia de /api/reparto/clientes que es admin-only). Devuelve solo los
// campos necesarios para elegir el destino de una reposición.

import { NextResponse } from "next/server";
import { getCurrentRep } from "@/lib/auth";
import { repartoAdmin } from "@/lib/supabase-reparto";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const rep = await getCurrentRep();
  if (!rep) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() ?? "";

  let query = repartoAdmin
    .from("clientes")
    .select("id, nombre, rfc, ciudad, zona, direccion")
    .order("nombre")
    .limit(30);
  if (q) query = query.or(`nombre.ilike.%${q}%,rfc.ilike.%${q}%,ciudad.ilike.%${q}%`);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}
