// POST /api/consignaciones/[id]/retiro
//
// Registra un retiro de consignación: los productos que el cliente solicitó
// retirar de su consignación. Crea un RetiroConsignacion en Base44 (estado
// borrador). Auth: admin o el vendedor dueño de la consignación.

import { NextResponse } from "next/server";
import { base44, type Base44RetiroConsignacion, type Base44RetiroItem } from "@/lib/base44";
import { loadConsignacionForRep } from "../../_lib/scope";

type ItemInput = {
  producto_id?: string;
  producto_nombre: string;
  codigo?: string;
  cantidad: number;
  motivo?: string;
};

type Body = {
  fecha: string;
  items: ItemInput[];
  notas?: string;
};

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const scope = await loadConsignacionForRep(params.id);
  if (!scope.ok) return scope.response;
  const { consignacion } = scope;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Body inválido (JSON)" }, { status: 400 });
  }

  const fecha = body.fecha || new Date().toISOString().slice(0, 10);
  const inItems = Array.isArray(body.items) ? body.items : [];
  const items: Base44RetiroItem[] = [];
  for (const it of inItems) {
    const cantidad = Number(it.cantidad);
    if (!it.producto_nombre?.trim() || !Number.isFinite(cantidad) || cantidad <= 0) continue;
    items.push({
      producto_id: it.producto_id,
      producto_nombre: it.producto_nombre.trim(),
      codigo: it.codigo,
      cantidad,
      motivo: it.motivo?.trim() || undefined,
    });
  }
  if (!items.length) {
    return NextResponse.json({ error: "Agrega al menos un producto a retirar con cantidad > 0" }, { status: 400 });
  }

  const total_unidades = items.reduce((s, i) => s + (Number(i.cantidad) || 0), 0);
  const hoy = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  const numero_retiro = `RET-${hoy}-${rand}`;

  const payload: Partial<Base44RetiroConsignacion> = {
    consignacion_id: consignacion.id,
    consignacion_numero: consignacion.cliente_nombre
      ? `${consignacion.cliente_nombre} · ${consignacion.fecha}`
      : consignacion.id,
    cliente_id: consignacion.cliente_id,
    cliente_nombre: consignacion.cliente_nombre,
    vendedor_id: consignacion.vendedor_id,
    vendedor_nombre: consignacion.vendedor_nombre,
    numero_retiro,
    fecha,
    items,
    total_unidades,
    estado: "borrador",
    notas: body.notas?.trim() || undefined,
  };

  try {
    const created = await base44.entity<Base44RetiroConsignacion>("RetiroConsignacion").create(payload);
    return NextResponse.json({ ok: true, id: created.id, numero_retiro });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error al registrar el retiro" },
      { status: 502 },
    );
  }
}
