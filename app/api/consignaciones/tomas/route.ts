// POST /api/consignaciones/tomas
//
// Crea una Toma de Inventario en Base44 para una consignación. Captura el conteo
// físico por producto y las firmas (encargado del cliente + vendedor) como PNG
// base64 dataURL. Si ambas firmas vienen, queda 'firmado'; si no, 'borrador'.
// Auth: admin o el vendedor dueño de la consignación.

import { NextResponse } from "next/server";
import { base44, type Base44TomaInventario, type Base44TomaInventarioItem } from "@/lib/base44";
import { loadConsignacionForRep } from "../_lib/scope";

type ItemInput = {
  producto_id?: string;
  producto_nombre?: string;
  codigo?: string;
  presentacion?: string;
  cantidad_anterior?: number;
  cantidad_contada?: number;
  observacion_item?: string;
};

type Body = {
  consignacion_id: string;
  fecha_toma?: string;
  almacen?: string;
  encargado_nombre?: string;
  encargado_cargo?: string;
  observaciones_generales?: string;
  ubicacion_gps?: string;
  firma_encargado?: string;
  firma_vendedor?: string;
  items: ItemInput[];
};

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Body inválido (JSON)" }, { status: 400 });
  }

  if (!body.consignacion_id) {
    return NextResponse.json({ error: "Falta la consignación" }, { status: 400 });
  }

  const scope = await loadConsignacionForRep(body.consignacion_id);
  if (!scope.ok) return scope.response;
  const { consignacion } = scope;

  const items: Base44TomaInventarioItem[] = [];
  for (const it of Array.isArray(body.items) ? body.items : []) {
    const anterior = Number(it.cantidad_anterior ?? 0);
    const contada = Number(it.cantidad_contada ?? 0);
    if (!it.producto_nombre?.trim()) continue;
    items.push({
      producto_id: it.producto_id,
      producto_nombre: it.producto_nombre.trim(),
      codigo: it.codigo?.trim() || undefined,
      presentacion: it.presentacion?.trim() || undefined,
      cantidad_anterior: Number.isFinite(anterior) ? anterior : 0,
      cantidad_contada: Number.isFinite(contada) ? contada : 0,
      diferencia: (Number.isFinite(contada) ? contada : 0) - (Number.isFinite(anterior) ? anterior : 0),
      observacion_item: it.observacion_item?.trim() || undefined,
    });
  }
  if (!items.length) {
    return NextResponse.json({ error: "Agrega al menos un producto al conteo" }, { status: 400 });
  }

  const firma_encargado = body.firma_encargado?.startsWith("data:image") ? body.firma_encargado : undefined;
  const firma_vendedor = body.firma_vendedor?.startsWith("data:image") ? body.firma_vendedor : undefined;
  const estado: Base44TomaInventario["estado"] = firma_encargado && firma_vendedor ? "firmado" : "borrador";

  const total_botellas = items.reduce((s, i) => s + (Number(i.cantidad_contada) || 0), 0);
  const total_etiquetas = items.filter((i) => (Number(i.cantidad_contada) || 0) > 0).length;

  const hoy = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  const numero_toma = `TOMA-${hoy}-${rand}`;

  const payload: Partial<Base44TomaInventario> = {
    numero_toma,
    consignacion_id: consignacion.id,
    consignacion_numero: consignacion.cliente_nombre
      ? `${consignacion.cliente_nombre} · ${consignacion.fecha}`
      : consignacion.id,
    cliente_id: consignacion.cliente_id,
    cliente_nombre: consignacion.cliente_nombre,
    vendedor_id: consignacion.vendedor_id,
    vendedor_nombre: consignacion.vendedor_nombre,
    almacen: body.almacen?.trim() || undefined,
    fecha_toma: body.fecha_toma || new Date().toISOString().slice(0, 10),
    items,
    total_botellas,
    total_etiquetas,
    encargado_nombre: body.encargado_nombre?.trim() || undefined,
    encargado_cargo: body.encargado_cargo?.trim() || undefined,
    firma_encargado,
    firma_vendedor,
    observaciones_generales: body.observaciones_generales?.trim() || undefined,
    ubicacion_gps: body.ubicacion_gps?.trim() || undefined,
    estado,
  };

  let created: Base44TomaInventario;
  try {
    created = await base44.entity<Base44TomaInventario>("TomaInventario").create(payload);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error al guardar la toma" },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true, id: created.id, numero_toma, estado });
}
