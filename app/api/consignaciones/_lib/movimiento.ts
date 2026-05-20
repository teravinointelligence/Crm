// Lógica compartida para aplicar un movimiento aditivo (ventas/devoluciones/cobros)
// sobre una consignación: validación de topes + cálculo del estado nuevo.
// La usan /movimiento (manual) y /tomas/[id]/facturar-consumo (desde una toma).

import type { Base44Consignacion } from "@/lib/base44";
import { totalItemsCantidad } from "./scope";
import { formatCurrencyMxn } from "./format";

export type MovimientoDelta = {
  vendidas?: number;
  devueltas?: number;
  cobrado?: number;
};

export type MovimientoResult =
  | {
      ok: true;
      update: Pick<
        Base44Consignacion,
        "cantidad_vendida" | "cantidad_devuelta" | "monto_cobrado" | "estado"
      >;
      estado: Base44Consignacion["estado"];
    }
  | { ok: false; error: string; status: number };

/**
 * Calcula los nuevos agregados y el estado resultante de aplicar un delta a la
 * consignación. NO escribe en Base44 — solo valida y computa. El caller decide
 * qué hacer con el resultado (incluir más campos en el update, etc.).
 */
export function computeMovimiento(
  consignacion: Base44Consignacion,
  delta: MovimientoDelta,
): MovimientoResult {
  if (consignacion.estado === "liquidada" || consignacion.estado === "devuelta") {
    return {
      ok: false,
      status: 409,
      error: `La consignación ya está ${consignacion.estado} — no acepta más movimientos.`,
    };
  }

  const vendidas = Number(delta.vendidas ?? 0);
  const devueltas = Number(delta.devueltas ?? 0);
  const cobrado = Number(delta.cobrado ?? 0);

  if (![vendidas, devueltas, cobrado].every((n) => Number.isFinite(n) && n >= 0)) {
    return { ok: false, status: 400, error: "Los valores deben ser números ≥ 0" };
  }
  if (vendidas === 0 && devueltas === 0 && cobrado === 0) {
    return { ok: false, status: 400, error: "Registra al menos venta, devolución o cobro" };
  }

  const totalCantidad = totalItemsCantidad(consignacion);
  const prevVendidas = Number(consignacion.cantidad_vendida ?? 0);
  const prevDevueltas = Number(consignacion.cantidad_devuelta ?? 0);
  const newVendidas = prevVendidas + vendidas;
  const newDevueltas = prevDevueltas + devueltas;

  if (totalCantidad > 0 && newVendidas + newDevueltas > totalCantidad) {
    const restante = totalCantidad - prevVendidas - prevDevueltas;
    return {
      ok: false,
      status: 400,
      error: `Solo quedan ${restante} unidades disponibles (${totalCantidad} consignadas, ${prevVendidas} vendidas, ${prevDevueltas} devueltas previas).`,
    };
  }

  const total = Number(consignacion.total ?? 0);
  const prevCobrado = Number(consignacion.monto_cobrado ?? 0);
  const newCobrado = Math.round((prevCobrado + cobrado) * 100) / 100;
  if (total > 0 && newCobrado > total + 0.01) {
    return {
      ok: false,
      status: 400,
      error: `El cobro acumulado (${formatCurrencyMxn(newCobrado)}) excede el total de la consignación (${formatCurrencyMxn(total)}).`,
    };
  }

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

  return {
    ok: true,
    estado: nuevoEstado,
    update: {
      cantidad_vendida: newVendidas,
      cantidad_devuelta: newDevueltas,
      monto_cobrado: newCobrado,
      estado: nuevoEstado,
    },
  };
}

/** Calcula el consumo (unidades + valor) de una toma contra los precios de la consignación. */
export function computeConsumoFromToma(
  tomaItems: { producto_id?: string; cantidad_anterior?: number; cantidad_contada?: number }[],
  consignacionItems: { producto_id: string; precio_unitario: number }[],
): { unidades: number; valor: number; detalle: { producto_id?: string; consumido: number; precio: number; subtotal: number }[] } {
  const precioById = new Map(consignacionItems.map((i) => [i.producto_id, Number(i.precio_unitario) || 0]));
  let unidades = 0;
  let valor = 0;
  const detalle: { producto_id?: string; consumido: number; precio: number; subtotal: number }[] = [];
  for (const it of tomaItems) {
    const anterior = Number(it.cantidad_anterior ?? 0);
    const contada = Number(it.cantidad_contada ?? 0);
    const consumido = Math.max(0, anterior - contada); // lo que falta = consumido
    if (consumido === 0) continue;
    const precio = it.producto_id ? (precioById.get(it.producto_id) ?? 0) : 0;
    const subtotal = Math.round(consumido * precio * 100) / 100;
    unidades += consumido;
    valor += subtotal;
    detalle.push({ producto_id: it.producto_id, consumido, precio, subtotal });
  }
  return { unidades, valor: Math.round(valor * 100) / 100, detalle };
}
