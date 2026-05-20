// POST /api/consignaciones/tomas/[id]/facturar-consumo
//
// "Factura lo consumido": toma la diferencia física reconciliada en una toma de
// inventario (cantidad_anterior - cantidad_contada por producto) y la registra
// como venta en la consignación vinculada. Opcionalmente registra el cobro
// recibido en la misma operación.
//
// Idempotente: marca la toma con `consumo_facturado` para no facturar dos veces.

import { NextResponse } from "next/server";
import {
  base44,
  type Base44Consignacion,
  type Base44TomaInventario,
} from "@/lib/base44";
import { appendNota, loadTomaForRep } from "../../../_lib/scope";
import { formatCurrencyMxn } from "../../../_lib/format";
import { computeConsumoFromToma, computeMovimiento } from "../../../_lib/movimiento";

type Body = {
  cobrado?: number; // monto recibido en esta facturación (opcional)
  notas?: string;
};

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const scope = await loadTomaForRep(params.id);
  if (!scope.ok) return scope.response;
  const { toma, repFullName } = scope;

  if (!toma.consignacion_id) {
    return NextResponse.json(
      { error: "Esta toma no está vinculada a una consignación. Vincúlala primero." },
      { status: 400 },
    );
  }
  if (toma.consumo_facturado) {
    return NextResponse.json(
      { error: "El consumo de esta toma ya fue facturado." },
      { status: 409 },
    );
  }

  let body: Body;
  try {
    body = (await req.json().catch(() => ({}))) as Body;
  } catch {
    body = {};
  }

  // Carga la consignación para obtener precios y validar scope/estado.
  let consignacion: Base44Consignacion;
  try {
    consignacion = await base44.entity<Base44Consignacion>("Consignacion").get(toma.consignacion_id);
  } catch {
    return NextResponse.json({ error: "Consignación vinculada no encontrada" }, { status: 404 });
  }

  // Calcula el consumo (unidades + valor) contra los precios de la consignación.
  const { unidades, valor } = computeConsumoFromToma(
    toma.items ?? [],
    (consignacion.items ?? []).map((i) => ({
      producto_id: i.producto_id,
      precio_unitario: Number(i.precio_unitario) || 0,
    })),
  );

  if (unidades <= 0) {
    return NextResponse.json(
      { error: "Esta toma no refleja consumo (las cantidades contadas no bajaron respecto a la anterior)." },
      { status: 400 },
    );
  }

  const cobrado = Number(body.cobrado ?? 0);
  if (!Number.isFinite(cobrado) || cobrado < 0) {
    return NextResponse.json({ error: "El cobro debe ser un número ≥ 0" }, { status: 400 });
  }

  // Aplica el movimiento (vendidas = consumo, cobrado = lo recibido) con la misma
  // lógica de topes/estado que el movimiento manual.
  const result = computeMovimiento(consignacion, { vendidas: unidades, cobrado });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const userNote = body.notas?.trim();
  const folio = toma.numero_toma ?? toma.id.slice(0, 8);
  const summary =
    `Consumo facturado desde toma ${folio} → ${unidades} unidades (${formatCurrencyMxn(valor)})` +
    (cobrado ? `, cobrado ${formatCurrencyMxn(cobrado)}` : "") +
    (userNote ? ` · ${userNote}` : "");
  const newNotas = appendNota(consignacion.notas, summary, repFullName);

  // 1) Actualiza la consignación con el movimiento.
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

  // 2) Marca la toma como facturada (idempotencia). Si esto falla, el movimiento
  //    ya quedó aplicado — lo reportamos pero no revertimos (el usuario verá el
  //    consumo reflejado y puede re-marcar manualmente si hace falta).
  try {
    await base44.entity<Base44TomaInventario>("TomaInventario").update(toma.id, {
      consumo_facturado: true,
      consumo_facturado_fecha: new Date().toISOString(),
    } as Partial<Base44TomaInventario>);
  } catch {
    return NextResponse.json({
      ok: true,
      estado: result.estado,
      unidades,
      valor,
      warning: "El consumo se registró en la consignación, pero no se pudo marcar la toma como facturada.",
    });
  }

  return NextResponse.json({ ok: true, estado: result.estado, unidades, valor });
}
