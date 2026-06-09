// POST /api/flota — crea un vehículo nuevo en la flota (app Base44 "Teravino
// Flota"). Lo usa el formulario de alta para registrar autos que aún no existen.

import { NextResponse } from "next/server";
import { getCurrentRep } from "@/lib/auth";
import { canAccessFlota } from "@/lib/modules";
import { base44Flota, type FlotaVehicle } from "@/lib/base44-flota";

function bad(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

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

  const data: Partial<FlotaVehicle> = {};
  for (const key of STRING_FIELDS) {
    if (key in body) {
      const raw = body[key];
      const val = typeof raw === "string" ? raw.trim() : raw == null ? "" : String(raw);
      if (val !== "") (data as Record<string, unknown>)[key] = val;
    }
  }
  for (const key of NUMBER_FIELDS) {
    if (key in body) {
      const raw = body[key];
      if (raw !== "" && raw != null) {
        const num = Number(raw);
        if (Number.isNaN(num)) return bad(`El campo ${key} debe ser numérico`);
        (data as Record<string, unknown>)[key] = num;
      }
    }
  }

  // Obligatorios en Base44.
  if (!data.brand) return bad("La marca es obligatoria");
  if (!data.model) return bad("El modelo es obligatorio");
  if (data.year == null) return bad("El año es obligatorio");

  try {
    const created = await base44Flota.entity<FlotaVehicle>("Vehicle").create(data);
    return NextResponse.json({ id: created.id }, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al crear el vehículo";
    if (msg.includes("BASE44")) return bad(msg, 503);
    return bad(msg, 502);
  }
}
