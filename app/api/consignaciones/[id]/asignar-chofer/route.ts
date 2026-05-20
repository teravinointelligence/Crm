// POST /api/consignaciones/[id]/asignar-chofer
//
// Asigna (o desasigna) un chofer a una consignación. El chofer viene del
// proyecto Reparto (`reparto.usuarios` con es_chofer=true). El nombre se
// denormaliza en Base44 para no tener que cruzar sistemas en cada lectura.
//
// Auth/scope: admin o el propio vendedor de la consignación (helper
// loadConsignacionForRep ya valida esto). Funciona en cualquier estado —
// también puedes reasignar un chofer en una consignación liquidada por si
// quieres corregir el dato histórico.

import { NextResponse } from "next/server";
import { base44, type Base44Consignacion } from "@/lib/base44";
import { repartoAdmin } from "@/lib/supabase-reparto";
import { appendNota, loadConsignacionForRep } from "../../_lib/scope";

type Body = {
  chofer_id: string | null;
};

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const scope = await loadConsignacionForRep(params.id);
  if (!scope.ok) return scope.response;
  const { consignacion, repFullName } = scope;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Body inválido (JSON)" }, { status: 400 });
  }

  let chofer_id: string | null = body.chofer_id;
  let chofer_nombre: string | null = null;

  if (chofer_id) {
    // Resolver nombre desde reparto.usuarios. Validamos que es chofer activo.
    const { data, error } = await repartoAdmin
      .from("usuarios")
      .select("id, nombre, es_chofer, activo")
      .eq("id", chofer_id)
      .maybeSingle();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data || !data.es_chofer || !data.activo) {
      return NextResponse.json(
        { error: "El chofer no existe o no está activo en reparto." },
        { status: 400 },
      );
    }
    chofer_nombre = data.nombre;
  } else {
    // Desasignar
    chofer_id = null;
    chofer_nombre = null;
  }

  const prevChofer = consignacion.chofer_nombre ?? "ninguno";
  const newChoferLabel = chofer_nombre ?? "ninguno";
  const line = chofer_id
    ? `Chofer asignado: ${newChoferLabel} (antes: ${prevChofer})`
    : `Chofer desasignado (antes: ${prevChofer})`;
  const newNotas = appendNota(consignacion.notas, line, repFullName);

  try {
    // Importante: enviamos null (no undefined) cuando desasignamos para que
    // Base44 limpie el campo. JSON.stringify omite undefined pero conserva null.
    await base44.entity<Base44Consignacion>("Consignacion").update(consignacion.id, {
      chofer_id,
      chofer_nombre,
      notas: newNotas,
    } as Partial<Base44Consignacion>);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error al asignar chofer" },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true, chofer_id, chofer_nombre });
}
