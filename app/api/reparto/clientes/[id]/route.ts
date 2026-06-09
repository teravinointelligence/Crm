// PATCH /api/reparto/clientes/[id] — actualiza datos editables del cliente de Reparto.
// Hoy solo el horario de recepción (respaldo cuando la cuenta del CRM no está
// enlazada por RFC). Requiere rol que gestione Reparto (admin / jefe_logistica).

import { NextResponse } from "next/server";
import { repartoAdmin } from "@/lib/supabase-reparto";
import { requireRepartoManage } from "../../_lib/guard";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const { response } = await requireRepartoManage();
  if (response) return response;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
  }

  const patch: Record<string, string | null> = {};
  if ("horario_recepcion" in body) {
    patch.horario_recepcion = body.horario_recepcion?.trim() || null;
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nada que actualizar" }, { status: 400 });
  }

  const { data, error } = await repartoAdmin
    .from("clientes")
    .update(patch)
    .eq("id", params.id)
    .select("id, horario_recepcion")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
