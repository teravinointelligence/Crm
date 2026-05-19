// POST /api/consignaciones/[id]/cerrar
//
// Cierra una consignación marcándola como `liquidada` o `devuelta` (estados
// terminales). No modifica las cantidades vendidas/devueltas/cobradas — solo
// el estado. Útil para casos donde quedan unidades sueltas pero el negocio
// decide cerrar la operación.

import { NextResponse } from "next/server";
import { base44, type Base44Consignacion } from "@/lib/base44";
import { appendNota, loadConsignacionForRep } from "../../_lib/scope";

type Body = {
  tipo: "liquidada" | "devuelta";
  motivo?: string;
};

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const scope = await loadConsignacionForRep(params.id);
  if (!scope.ok) return scope.response;
  const { consignacion, repFullName } = scope;

  if (consignacion.estado === "liquidada" || consignacion.estado === "devuelta") {
    return NextResponse.json(
      { error: `La consignación ya está ${consignacion.estado}.` },
      { status: 409 },
    );
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Body inválido (JSON)" }, { status: 400 });
  }

  if (body.tipo !== "liquidada" && body.tipo !== "devuelta") {
    return NextResponse.json({ error: "tipo debe ser 'liquidada' o 'devuelta'" }, { status: 400 });
  }

  const motivo = body.motivo?.trim();
  const line = `Cerrada como ${body.tipo}${motivo ? ` · ${motivo}` : ""}`;
  const newNotas = appendNota(consignacion.notas, line, repFullName);

  try {
    await base44.entity<Base44Consignacion>("Consignacion").update(consignacion.id, {
      estado: body.tipo,
      notas: newNotas,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error al cerrar consignación" },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true, estado: body.tipo });
}
