// PUT /api/flota/[id] — actualiza un vehículo de la flota (app Base44 "Teravino
// Flota"). Lo usa el formulario de detalle para que Logística complete los datos
// faltantes de cada auto.

import { NextResponse } from "next/server";
import { getCurrentRep } from "@/lib/auth";
import { canAccessFlota } from "@/lib/modules";
import { base44Flota, type FlotaVehicle } from "@/lib/base44-flota";

function bad(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

// Campos editables desde el CRM. brand/model/year son obligatorios en Base44.
const STRING_FIELDS = [
  "brand",
  "model",
  "version",
  "plates",
  "vin",
  "holder",
  "location",
  "assigned_driver",
  "notes",
] as const;
const NUMBER_FIELDS = ["year", "current_km", "estimated_value"] as const;

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const rep = await getCurrentRep();
  if (!rep) return bad("No autenticado", 401);
  if (!canAccessFlota(rep.role)) return bad("Sin acceso a Flota", 403);
  if (!params.id) return bad("Falta el id del vehículo");

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return bad("Body inválido (JSON)");
  }

  const patch: Partial<FlotaVehicle> = {};
  for (const key of STRING_FIELDS) {
    if (key in body) {
      const raw = body[key];
      const val = typeof raw === "string" ? raw.trim() : raw == null ? "" : String(raw);
      (patch as Record<string, unknown>)[key] = val === "" ? null : val;
    }
  }
  for (const key of NUMBER_FIELDS) {
    if (key in body) {
      const raw = body[key];
      if (raw === "" || raw == null) {
        (patch as Record<string, unknown>)[key] = null;
      } else {
        const num = Number(raw);
        if (Number.isNaN(num)) return bad(`El campo ${key} debe ser numérico`);
        (patch as Record<string, unknown>)[key] = num;
      }
    }
  }

  // Validación mínima de obligatorios si vienen en el payload.
  if ("brand" in patch && !patch.brand) return bad("La marca es obligatoria");
  if ("model" in patch && !patch.model) return bad("El modelo es obligatorio");
  if ("year" in patch && patch.year == null) return bad("El año es obligatorio");

  try {
    const updated = await base44Flota.entity<FlotaVehicle>("Vehicle").update(params.id, patch);
    return NextResponse.json({ id: updated.id });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al actualizar el vehículo";
    if (msg.includes("BASE44")) return bad(msg, 503);
    return bad(msg, 502);
  }
}
