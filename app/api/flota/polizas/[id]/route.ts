// PUT/DELETE /api/flota/polizas/[id] — actualiza o elimina una póliza de seguro.

import { NextResponse } from "next/server";
import { getCurrentRep } from "@/lib/auth";
import { canAccessFlota } from "@/lib/modules";
import { base44Flota, type FlotaInsurancePolicy } from "@/lib/base44-flota";
import { parsePayload } from "@/lib/flota-payload";

const STRING_FIELDS = [
  "insurer",
  "policy_number",
  "coverage",
  "payment_method",
  "start_date",
  "end_date",
  "documento_pdf",
  "notes",
] as const;
const NUMBER_FIELDS = ["insured_amount", "annual_premium"] as const;

function bad(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const rep = await getCurrentRep();
  if (!rep) return bad("No autenticado", 401);
  if (!canAccessFlota(rep.role)) return bad("Sin acceso a Flota", 403);
  if (!params.id) return bad("Falta el id de la póliza");

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return bad("Body inválido (JSON)");
  }

  const parsed = parsePayload<FlotaInsurancePolicy>(body, STRING_FIELDS, NUMBER_FIELDS, {
    blankToNull: true,
  });
  if ("error" in parsed) return bad(parsed.error);

  if ("insurer" in parsed.data && !parsed.data.insurer) return bad("La aseguradora es obligatoria");
  if ("policy_number" in parsed.data && !parsed.data.policy_number)
    return bad("El número de póliza es obligatorio");

  try {
    const updated = await base44Flota
      .entity<FlotaInsurancePolicy>("InsurancePolicy")
      .update(params.id, parsed.data);
    return NextResponse.json({ id: updated.id });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al actualizar la póliza";
    return bad(msg, msg.includes("BASE44") ? 503 : 502);
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const rep = await getCurrentRep();
  if (!rep) return bad("No autenticado", 401);
  if (!canAccessFlota(rep.role)) return bad("Sin acceso a Flota", 403);
  if (!params.id) return bad("Falta el id de la póliza");

  try {
    await base44Flota.entity<FlotaInsurancePolicy>("InsurancePolicy").remove(params.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al eliminar la póliza";
    return bad(msg, msg.includes("BASE44") ? 503 : 502);
  }
}
