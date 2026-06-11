// POST /api/consignaciones/[id]/precios
//
// Corrección MANUAL de precios de los renglones de una consignación heredada
// con $0.00 (o precios incompletos). Reglas:
//   - Scope: admin o el vendedor dueño (loadConsignacionForRep).
//   - Solo si NO tiene movimientos (vendidas/devueltas/cobros) — con
//     movimientos, cambiar precios rompería los agregados históricos.
//   - Solo si no está archivada.
//   - Las cantidades no cambian; solo precios. Valida con la misma regla de
//     creación (todo precio > 0, total > 0) vía aplicarPreciosCorregidos.
//   - Auditoría: nota con total anterior → nuevo, quién y cuándo.

import { NextResponse } from "next/server";
import { base44, type Base44Consignacion } from "@/lib/base44";
import { appendNota, loadConsignacionForRep } from "../../_lib/scope";
import { aplicarPreciosCorregidos, type PrecioCorregido } from "../../_lib/validate-items";
import { formatCurrencyMxn } from "../../_lib/format";

type Body = {
  precios: PrecioCorregido[];
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
  if (!Array.isArray(body.precios) || body.precios.length === 0) {
    return NextResponse.json({ error: "Falta la lista de precios corregidos" }, { status: 400 });
  }

  if (consignacion.archivada) {
    return NextResponse.json(
      { error: "La consignación está archivada — restáurala antes de corregir precios." },
      { status: 409 },
    );
  }

  const tieneMovimientos =
    Number(consignacion.cantidad_vendida ?? 0) > 0 ||
    Number(consignacion.cantidad_devuelta ?? 0) > 0 ||
    Number(consignacion.monto_cobrado ?? 0) > 0;
  if (tieneMovimientos) {
    return NextResponse.json(
      { error: "Esta consignación ya tiene movimientos — corregir precios rompería los agregados históricos." },
      { status: 409 },
    );
  }

  const result = aplicarPreciosCorregidos(consignacion.items ?? [], body.precios);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  const totalAnterior = Number(consignacion.total ?? 0);
  const linea = `Precios corregidos manualmente: total ${formatCurrencyMxn(totalAnterior)} → ${formatCurrencyMxn(result.total)}`;

  try {
    await base44.entity<Base44Consignacion>("Consignacion").update(consignacion.id, {
      items: result.items,
      total: result.total,
      notas: appendNota(consignacion.notas, linea, repFullName),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error al actualizar precios" },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true, total: result.total });
}
