// POST /api/flota/servicios — registra un servicio mecánico o reparación.

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

export async function POST(req: Request) {
  const rep = await getCurrentRep();
  if (!rep) return bad("No autenticado", 401);
  if (!canAccessFlota(rep.role)) return bad("Sin acceso a Flota", 403);

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return bad("Body inválido (JSON)");
  }

  const vehicleId = typeof body.vehicle_id === "string" ? body.vehicle_id.trim() : "";
  if (!vehicleId) return bad("Falta vehicle_id");

  const parsed = parsePayload<FlotaMechanicalService>(body, STRING_FIELDS, NUMBER_FIELDS, {
    blankToNull: false,
  });
  if ("error" in parsed) return bad(parsed.error);
  const data = { ...parsed.data, vehicle_id: vehicleId };

  if (!data.date) return bad("La fecha es obligatoria");
  if (!data.service_type) return bad("El tipo de servicio es obligatorio");

  try {
    const created = await base44Flota
      .entity<FlotaMechanicalService>("MechanicalService")
      .create(data);
    return NextResponse.json({ id: created.id }, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al registrar el servicio";
    return bad(msg, msg.includes("BASE44") ? 503 : 502);
  }
}
