// GET /api/reparto/pedidos/[id] — pedido + cliente + chofer + partidas + entregas.
// PATCH /api/reparto/pedidos/[id] — actualiza estatus, chofer, ventana, etc.

import { NextResponse } from "next/server";
import { repartoAdmin } from "@/lib/supabase-reparto";
import { requireReparto, requireRepartoManage } from "../../_lib/guard";
import { PEDIDO_ESTATUS, PRIORIDADES } from "@/types/reparto";

export const dynamic = "force-dynamic";

const ALLOWED_ESTATUS = new Set<string>(PEDIDO_ESTATUS);
const ALLOWED_PRIORIDADES = new Set<string>(PRIORIDADES);
const PATCHABLE = new Set([
  "chofer_id", "estatus", "ventana_inicio", "ventana_fin",
  "prioridad", "direccion_entrega", "notas", "motivo_problema",
]);

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const { response } = await requireReparto();
  if (response) return response;

  const { data, error } = await repartoAdmin
    .from("pedidos")
    .select(
      "*, clientes:cliente_id(id, nombre, rfc, ciudad, zona, direccion, contacto_nombre, contacto_tel, contacto_email), chofer:chofer_id(id, nombre, email, telefono), pedido_productos(id, descripcion, cantidad, unidad, clave_sat, valor_unitario, importe, descuento), entregas(id, timestamp_entrega, foto_url, compartido_whatsapp, observaciones, chofer_id, lat, lng)",
    )
    .eq("id", params.id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json({ data });
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const { response } = await requireRepartoManage();
  if (response) return response;
  const body = await req.json();

  const update: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body ?? {})) {
    if (!PATCHABLE.has(k)) continue;
    if (k === "estatus" && typeof v === "string" && !ALLOWED_ESTATUS.has(v)) continue;
    if (k === "prioridad" && typeof v === "string" && !ALLOWED_PRIORIDADES.has(v)) continue;
    update[k] = v === "" ? null : v;
  }
  // Si se asigna un chofer y el estatus es pendiente_asignar, sube a 'asignado'.
  if (update.chofer_id && !("estatus" in update)) {
    const { data: row } = await repartoAdmin
      .from("pedidos").select("estatus").eq("id", params.id).single();
    if (row?.estatus === "pendiente_asignar") update.estatus = "asignado";
  }
  // Si se quita el chofer, regresa a pendiente_asignar (salvo entregado).
  if (update.chofer_id === null) {
    update.estatus = "pendiente_asignar";
  }

  if (!Object.keys(update).length) {
    return NextResponse.json({ error: "Nada que actualizar" }, { status: 400 });
  }

  const { data, error } = await repartoAdmin
    .from("pedidos")
    .update(update)
    .eq("id", params.id)
    .select("id, estatus, chofer_id, prioridad, ventana_inicio, ventana_fin, direccion_entrega, notas, motivo_problema, updated_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
