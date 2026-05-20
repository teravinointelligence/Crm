// POST /api/consignaciones/[id]/retiro
//
// Registra un retiro de consignación: los productos que el cliente solicitó
// retirar de su consignación. Crea un RetiroConsignacion en Base44 (estado
// borrador). Auth: admin o el vendedor dueño de la consignación.

import { NextResponse } from "next/server";
import { base44, type Base44Consignacion, type Base44RetiroConsignacion, type Base44RetiroItem } from "@/lib/base44";
import { appendNota, loadConsignacionForRep } from "../../_lib/scope";
import { computeMovimiento } from "../../_lib/movimiento";

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
  const { consignacion, repFullName } = scope;

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

  // El retiro descuenta de la consignación: aplicamos las unidades retiradas
  // como devolución sobre los agregados (`cantidad_devuelta`) y recalculamos el
  // estado con la MISMA lógica que "Registrar movimiento". Validamos ANTES de
  // crear el documento para no dejar un retiro que la consignación no puede
  // reconciliar (terminal o sin unidades disponibles).
  const mov = computeMovimiento(consignacion, { devueltas: total_unidades });
  if (!mov.ok) {
    return NextResponse.json({ error: mov.error }, { status: mov.status });
  }

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

  let created: Base44RetiroConsignacion;
  try {
    created = await base44.entity<Base44RetiroConsignacion>("RetiroConsignacion").create(payload);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error al registrar el retiro" },
      { status: 502 },
    );
  }

  // Aplicamos la devolución a la consignación (agregados + estado) y dejamos
  // bitácora en `notas`. Si esto falla, el retiro ya quedó como documento; lo
  // avisamos para que la devolución pueda registrarse a mano.
  const nota = appendNota(
    consignacion.notas,
    `Retiro ${numero_retiro} → ${total_unidades} unidad(es) devuelta(s)`,
    repFullName,
  );
  try {
    await base44.entity<Base44Consignacion>("Consignacion").update(consignacion.id, {
      ...mov.update,
      notas: nota,
    });
  } catch {
    return NextResponse.json({
      ok: true,
      id: created.id,
      numero_retiro,
      devolucion_aplicada: false,
      warning:
        "El retiro se registró, pero no se pudo actualizar la consignación. Registra la devolución manualmente en 'Registrar movimiento'.",
    });
  }

  return NextResponse.json({
    ok: true,
    id: created.id,
    numero_retiro,
    devolucion_aplicada: true,
    estado: mov.estado,
  });
}
