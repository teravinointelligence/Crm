// POST /api/consignaciones/tomas/[id]/vincular
//
// Vincula manualmente una toma de inventario huérfana (sin consignacion_id) a
// una consignación. La sugerencia se calcula en la UI; aquí solo validamos y
// escribimos — NUNCA se vincula automáticamente sin confirmación del usuario.
//
// Auth/scope: admin, o el vendedor dueño de AMBOS registros (toma y
// consignación). Reglas:
//   - la toma no debe estar ya vinculada (409)
//   - la toma no debe estar anulada (400)
//   - si el cliente de la toma y el de la consignación difieren, se permite
//     (hay clientes duplicados en Base44) pero se devuelve warning y se deja
//     bitácora en las observaciones de la toma.

import { NextResponse } from "next/server";
import { base44, type Base44Consignacion, type Base44TomaInventario } from "@/lib/base44";
import { appendNota, loadConsignacionForRep, loadTomaForRep } from "../../../_lib/scope";

type Body = {
  consignacion_id: string;
};

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const tomaScope = await loadTomaForRep(params.id);
  if (!tomaScope.ok) return tomaScope.response;
  const { toma, repFullName } = tomaScope;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Body inválido (JSON)" }, { status: 400 });
  }
  if (!body.consignacion_id) {
    return NextResponse.json({ error: "Falta consignacion_id" }, { status: 400 });
  }

  if (toma.consignacion_id) {
    return NextResponse.json(
      { error: "La toma ya está vinculada a una consignación." },
      { status: 409 },
    );
  }
  if (toma.estado === "anulado") {
    return NextResponse.json(
      { error: "La toma está anulada — no se puede vincular." },
      { status: 400 },
    );
  }

  // Valida existencia + scope de la consignación (mismo helper que el resto de rutas).
  const consigScope = await loadConsignacionForRep(body.consignacion_id);
  if (!consigScope.ok) return consigScope.response;
  const { consignacion } = consigScope;

  let warning: string | undefined;
  if (toma.cliente_id && consignacion.cliente_id && toma.cliente_id !== consignacion.cliente_id) {
    warning = `El cliente de la toma (${toma.cliente_nombre ?? toma.cliente_id}) no es el mismo registro que el de la consignación (${consignacion.cliente_nombre ?? consignacion.cliente_id}).`;
  }

  const linea = `Vinculada manualmente a la consignación ${consignacion.id} (${consignacion.cliente_nombre ?? "—"}, ${consignacion.fecha})${warning ? " — clientes distintos en Base44" : ""}`;
  const observaciones = appendNota(toma.observaciones_generales, linea, repFullName);

  try {
    await base44.entity<Base44TomaInventario>("TomaInventario").update(toma.id, {
      consignacion_id: consignacion.id,
      observaciones_generales: observaciones,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error al vincular la toma" },
      { status: 502 },
    );
  }

  // Auditoría también del lado de la consignación (quién vinculó qué y cuándo).
  // La vinculación ya quedó hecha; si esta nota falla, no revertimos — solo avisamos.
  try {
    const notaConsig = appendNota(
      consignacion.notas,
      `Toma ${toma.numero_toma ?? toma.id} (${toma.fecha_toma}) vinculada a esta consignación`,
      repFullName,
    );
    await base44.entity<Base44Consignacion>("Consignacion").update(consignacion.id, {
      notas: notaConsig,
    });
  } catch {
    warning = [warning, "La toma quedó vinculada pero no se pudo escribir la nota de auditoría en la consignación."]
      .filter(Boolean)
      .join(" ");
  }

  return NextResponse.json({ ok: true, consignacion_id: consignacion.id, warning });
}
