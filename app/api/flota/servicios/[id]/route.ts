// PUT/DELETE /api/flota/servicios/[id] — actualiza o elimina un servicio.

import { NextResponse } from "next/server";
import { getCurrentRep } from "@/lib/auth";
import { canAccessFlota } from "@/lib/modules";
import { base44Flota, type FlotaMechanicalService } from "@/lib/base44-flota";
import { parsePayload } from "@/lib/flota-payload";

const STRING_FIELDS = [
  "service_type",
  "date",
  "description",
  "workshop",
  "next_service_date",
  "documento_pdf",
  "notes",
] as const;
const NUMBER_FIELDS = ["cost", "km_at_service"] as const;

function bad(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const rep = await getCurrentRep();
  if (!rep) return bad("No autenticado", 401);
  if (!canAccessFlota(rep.role)) return bad("Sin acceso a Flota", 403);
  if (!params.id) return bad("Falta el id del servicio");

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return bad("Body inválido (JSON)");
  }

  const parsed = parsePayload<FlotaMechanicalService>(body, STRING_FIELDS, NUMBER_FIELDS, {
    blankToNull: true,
  });
  if ("error" in parsed) return bad(parsed.error);

  if ("date" in parsed.data && !parsed.data.date) return bad("La fecha es obligatoria");
  if ("service_type" in parsed.data && !parsed.data.service_type)
    return bad("El tipo de servicio es obligatorio");

  try {
    const updated = await base44Flota
      .entity<FlotaMechanicalService>("MechanicalService")
      .update(params.id, parsed.data);
    return NextResponse.json({ id: updated.id });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al actualizar el servicio";
    return bad(msg, msg.includes("BASE44") ? 503 : 502);
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const rep = await getCurrentRep();
  if (!rep) return bad("No autenticado", 401);
  if (!canAccessFlota(rep.role)) return bad("Sin acceso a Flota", 403);
  if (!params.id) return bad("Falta el id del servicio");

  try {
    await base44Flota.entity<FlotaMechanicalService>("MechanicalService").remove(params.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al eliminar el servicio";
    return bad(msg, msg.includes("BASE44") ? 503 : 502);
  }
}
