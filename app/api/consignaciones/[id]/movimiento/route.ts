// POST /api/consignaciones/[id]/movimiento
//
// Registra un movimiento aditivo (ventas + devoluciones + cobros) sobre una
// consignación existente. El server suma a los agregados (`cantidad_vendida`,
// `cantidad_devuelta`, `monto_cobrado`) y recalcula el estado automáticamente.
//
// Si la consignación ya está en estado terminal (`liquidada` / `devuelta`),
// no acepta más movimientos.

import { NextResponse } from "next/server";
import { base44, type Base44Consignacion } from "@/lib/base44";
import { appendNota, loadConsignacionForRep } from "../../_lib/scope";
import { formatCurrencyMxn } from "../../_lib/format";
import { computeMovimiento } from "../../_lib/movimiento";

type Body = {
  vendidas?: number;
  devueltas?: number;
  cobrado?: number;
  notas?: string;
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

  const vendidas = Number(body.vendidas ?? 0);
  const devueltas = Number(body.devueltas ?? 0);
  const cobrado = Number(body.cobrado ?? 0);

  const result = computeMovimiento(consignacion, { vendidas, devueltas, cobrado });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  // Bitácora en notas.
  const parts: string[] = [];
  if (vendidas) parts.push(`vendidas ${vendidas}`);
  if (devueltas) parts.push(`devueltas ${devueltas}`);
  if (cobrado) parts.push(`cobrado ${formatCurrencyMxn(cobrado)}`);
  const userNote = body.notas?.trim();
  const summary = `Movimiento → ${parts.join(", ")}${userNote ? ` · ${userNote}` : ""}`;
  const newNotas = appendNota(consignacion.notas, summary, repFullName);

  try {
    await base44.entity<Base44Consignacion>("Consignacion").update(consignacion.id, {
      ...result.update,
      notas: newNotas,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error al guardar movimiento" },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true, estado: result.estado });
}
