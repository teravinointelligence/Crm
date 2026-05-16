// GET /api/reparto/clientes?q= — lista (opcionalmente filtrada) de clientes de Reparto.
// POST /api/reparto/clientes — crea un cliente nuevo.

import { NextResponse } from "next/server";
import { repartoAdmin } from "@/lib/supabase-reparto";
import { requireAdmin } from "../_lib/guard";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { response } = await requireAdmin();
  if (response) return response;
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() ?? "";
  let query = repartoAdmin
    .from("clientes")
    .select("id, rfc, nombre, ciudad, zona, contacto_nombre, contacto_tel, contacto_email, direccion")
    .order("nombre")
    .limit(50);
  if (q) query = query.or(`nombre.ilike.%${q}%,rfc.ilike.%${q}%,ciudad.ilike.%${q}%`);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

export async function POST(req: Request) {
  const { response } = await requireAdmin();
  if (response) return response;
  const body = await req.json();
  if (!body?.nombre?.trim()) {
    return NextResponse.json({ error: "Nombre obligatorio" }, { status: 400 });
  }
  const { data, error } = await repartoAdmin
    .from("clientes")
    .insert({
      rfc: body.rfc?.trim() || null,
      nombre: body.nombre.trim(),
      ciudad: body.ciudad?.trim() || null,
      zona: body.zona?.trim() || null,
      direccion: body.direccion?.trim() || null,
      contacto_nombre: body.contacto_nombre?.trim() || null,
      contacto_tel: body.contacto_tel?.trim() || null,
      contacto_email: body.contacto_email?.trim() || null,
      horario_recepcion: body.horario_recepcion?.trim() || null,
      notas: body.notas?.trim() || null,
    })
    .select("id, rfc, nombre")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
