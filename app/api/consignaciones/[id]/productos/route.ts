// POST /api/consignaciones/[id]/productos
//
// Añade uno o varios items a una consignación existente, recalculando el total.
// Sólo el rep dueño o un admin pueden modificarla.

import { NextResponse } from "next/server";
import { base44, type Base44Consignacion, type Base44ConsignacionItem } from "@/lib/base44";
import { appendNota, loadConsignacionForRep } from "../../_lib/scope";

type ItemBody = {
  producto_id: string;
  producto_nombre: string;
  cantidad: number;
  precio_unitario: number;
};

type Body = {
  items: ItemBody[];
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

  if (!Array.isArray(body.items) || body.items.length === 0) {
    return NextResponse.json({ error: "Se requiere al menos un item" }, { status: 400 });
  }

  for (const it of body.items) {
    if (!it.producto_id || !it.producto_nombre) {
      return NextResponse.json({ error: "Cada item requiere producto_id y producto_nombre" }, { status: 400 });
    }
    if (!(Number(it.cantidad) > 0)) {
      return NextResponse.json({ error: `Cantidad inválida para "${it.producto_nombre}"` }, { status: 400 });
    }
    if (!(Number(it.precio_unitario) > 0)) {
      return NextResponse.json({ error: `Precio unitario inválido para "${it.producto_nombre}"` }, { status: 400 });
    }
  }

  const newItems: Base44ConsignacionItem[] = body.items.map((it) => ({
    producto_id: it.producto_id,
    producto_nombre: it.producto_nombre,
    cantidad: Number(it.cantidad),
    precio_unitario: Number(it.precio_unitario),
    subtotal: Math.round(Number(it.cantidad) * Number(it.precio_unitario) * 100) / 100,
  }));

  const existingItems: Base44ConsignacionItem[] = consignacion.items ?? [];
  const allItems = [...existingItems, ...newItems];
  const newTotal = Math.round(allItems.reduce((s, i) => s + (Number(i.subtotal) || 0), 0) * 100) / 100;

  const addedNames = newItems.map((i) => `${i.producto_nombre} ×${i.cantidad}`).join(", ");
  const newNotas = appendNota(
    consignacion.notas,
    `Producto(s) agregado(s): ${addedNames}`,
    repFullName,
  );

  try {
    await base44.entity<Base44Consignacion>("Consignacion").update(consignacion.id, {
      items: allItems,
      total: newTotal,
      notas: newNotas,
    } as Partial<Base44Consignacion>);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error al actualizar la consignación" },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true, total: newTotal, items: allItems });
}
