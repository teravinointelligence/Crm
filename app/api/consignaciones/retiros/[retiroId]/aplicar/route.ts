// POST /api/consignaciones/retiros/[retiroId]/aplicar
//
// Confirma un retiro (borrador/confirmado → recogido) y APLICA sus unidades al
// inventario de la consignación: las suma a `cantidad_devuelta` (mismo cálculo
// que un movimiento de devolución, con su tope y recálculo de estado).
//
// Idempotente: deja un marcador en la bitácora (`notas`) de la consignación;
// si ya está, no vuelve a aplicar (aunque el estado del retiro no se hubiera
// alcanzado a guardar). Auth: admin o el vendedor dueño de la consignación.

import { NextResponse } from "next/server";
import { base44, type Base44Consignacion, type Base44RetiroConsignacion } from "@/lib/base44";
import { appendNota, loadConsignacionForRep } from "../../../_lib/scope";
import { computeMovimiento } from "../../../_lib/movimiento";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: { retiroId: string } }) {
  let retiro: Base44RetiroConsignacion;
  try {
    retiro = await base44.entity<Base44RetiroConsignacion>("RetiroConsignacion").get(params.retiroId);
  } catch {
    return NextResponse.json({ error: "Retiro no encontrado" }, { status: 404 });
  }
  if (!retiro.consignacion_id) {
    return NextResponse.json({ error: "El retiro no está ligado a una consignación." }, { status: 400 });
  }
  if (retiro.estado === "cancelado") {
    return NextResponse.json({ error: "El retiro está cancelado." }, { status: 409 });
  }
  if (retiro.estado === "recogido") {
    return NextResponse.json({ error: "Este retiro ya fue aplicado al inventario." }, { status: 409 });
  }

  // Scope (admin o vendedor dueño) + carga la consignación.
  const scope = await loadConsignacionForRep(retiro.consignacion_id);
  if (!scope.ok) return scope.response;
  const { consignacion, repFullName } = scope;

  const folio = retiro.numero_retiro ?? retiro.id.slice(0, 8);
  const marker = `Retiro ${folio} aplicado`;
  if (consignacion.notas?.includes(marker)) {
    return NextResponse.json({ error: "Este retiro ya fue aplicado al inventario." }, { status: 409 });
  }

  const units = Number(
    retiro.total_unidades ?? (retiro.items ?? []).reduce((s, i) => s + (Number(i.cantidad) || 0), 0),
  );
  if (!Number.isFinite(units) || units <= 0) {
    return NextResponse.json({ error: "El retiro no tiene unidades para aplicar." }, { status: 400 });
  }

  const result = computeMovimiento(consignacion, { devueltas: units });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const newNotas = appendNota(consignacion.notas, `${marker} → devueltas ${units}`, repFullName);
  try {
    await base44.entity<Base44Consignacion>("Consignacion").update(consignacion.id, {
      ...result.update,
      notas: newNotas,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error al actualizar la consignación" },
      { status: 502 },
    );
  }

  // Marca el retiro como recogido. Best-effort: si falla, el marcador en notas
  // ya evita una doble aplicación.
  try {
    await base44.entity<Base44RetiroConsignacion>("RetiroConsignacion").update(retiro.id, {
      estado: "recogido",
    });
  } catch {
    // el inventario ya quedó aplicado; el estado del retiro se puede reintentar
  }

  return NextResponse.json({ ok: true, estado: result.estado, devueltas: units });
}
