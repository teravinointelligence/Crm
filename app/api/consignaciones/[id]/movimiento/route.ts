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
import {
  appendNota,
  loadConsignacionForRep,
  totalItemsCantidad,
} from "../../_lib/scope";
import { formatCurrencyMxn } from "../../_lib/format";

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

  if (consignacion.estado === "liquidada" || consignacion.estado === "devuelta") {
    return NextResponse.json(
      { error: `La consignación ya está ${consignacion.estado} — no acepta más movimientos.` },
      { status: 409 },
    );
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Body inválido (JSON)" }, { status: 400 });
  }

  const vendidas = Number(body.vendidas ?? 0);
  const devueltas = Number(body.devueltas ?? 0);
  const cobrado = Number(body.cobrado ?? 0);

  if (![vendidas, devueltas, cobrado].every((n) => Number.isFinite(n) && n >= 0)) {
    return NextResponse.json({ error: "Los valores deben ser números ≥ 0" }, { status: 400 });
  }
  if (vendidas === 0 && devueltas === 0 && cobrado === 0) {
    return NextResponse.json({ error: "Registra al menos venta, devolución o cobro" }, { status: 400 });
  }

  // Validar topes: la suma vendidas+devueltas no puede exceder el total consignado.
  const totalCantidad = totalItemsCantidad(consignacion);
  const prevVendidas = Number(consignacion.cantidad_vendida ?? 0);
  const prevDevueltas = Number(consignacion.cantidad_devuelta ?? 0);
  const newVendidas = prevVendidas + vendidas;
  const newDevueltas = prevDevueltas + devueltas;

  if (totalCantidad > 0 && newVendidas + newDevueltas > totalCantidad) {
    const restante = totalCantidad - prevVendidas - prevDevueltas;
    return NextResponse.json(
      {
        error: `Solo quedan ${restante} unidades disponibles (${totalCantidad} consignadas, ${prevVendidas} vendidas, ${prevDevueltas} devueltas previas).`,
      },
      { status: 400 },
    );
  }

  // Validar cobro: no debería exceder el total consignado (con cierta tolerancia).
  const total = Number(consignacion.total ?? 0);
  const prevCobrado = Number(consignacion.monto_cobrado ?? 0);
  const newCobrado = Math.round((prevCobrado + cobrado) * 100) / 100;
  if (total > 0 && newCobrado > total + 0.01) {
    return NextResponse.json(
      {
        error: `El cobro acumulado (${formatCurrencyMxn(newCobrado)}) excede el total de la consignación (${formatCurrencyMxn(total)}).`,
      },
      { status: 400 },
    );
  }

  // Estado nuevo: si todo cerrado → liquidada/devuelta; si hay movimiento parcial → parcial.
  // Solo aplicamos automaticamente "liquidada" si además ya se cobró todo. Si vendió todo pero
  // aún debe → queda parcial.
  let nuevoEstado: Base44Consignacion["estado"] = consignacion.estado;
  const todoMovido = totalCantidad > 0 && newVendidas + newDevueltas >= totalCantidad;
  const todoCobrado = total > 0 && newCobrado + 0.01 >= total;
  if (todoMovido && newVendidas === 0 && newDevueltas === totalCantidad) {
    nuevoEstado = "devuelta";
  } else if (todoMovido && todoCobrado) {
    nuevoEstado = "liquidada";
  } else if (newVendidas > 0 || newDevueltas > 0 || newCobrado > 0) {
    nuevoEstado = "parcial";
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
      cantidad_vendida: newVendidas,
      cantidad_devuelta: newDevueltas,
      monto_cobrado: newCobrado,
      estado: nuevoEstado,
      notas: newNotas,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error al guardar movimiento" },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true, estado: nuevoEstado });
}
