// POST /api/consignaciones/[id]/archivar
//
// Archiva (o restaura) una consignación como duplicada/basura. REVERSIBLE:
// solo marca `archivada` + motivo; no borra nada. Las archivadas salen de
// listados y KPIs del CRM pero siguen en Base44.
//
// Auth: SOLO admin (es herramienta de limpieza de datos, no de operación).
// Auditoría: appendNota en `notas` con quién y cuándo.

import { NextResponse } from "next/server";
import { getCurrentRep } from "@/lib/auth";
import { canAccessFacturacion } from "@/lib/modules";
import { base44, type Base44Consignacion } from "@/lib/base44";
import { appendNota } from "../../_lib/scope";

type Body = {
  accion: "archivar" | "restaurar";
  motivo?: string;
};

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const rep = await getCurrentRep();
  if (!rep) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!canAccessFacturacion(rep.role)) {
    return NextResponse.json({ error: "Solo un admin puede archivar consignaciones." }, { status: 403 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Body inválido (JSON)" }, { status: 400 });
  }
  if (body.accion !== "archivar" && body.accion !== "restaurar") {
    return NextResponse.json({ error: "accion debe ser 'archivar' o 'restaurar'" }, { status: 400 });
  }

  let consignacion: Base44Consignacion;
  try {
    consignacion = await base44.entity<Base44Consignacion>("Consignacion").get(params.id);
  } catch {
    return NextResponse.json({ error: "Consignación no encontrada" }, { status: 404 });
  }

  if (body.accion === "archivar" && consignacion.archivada) {
    return NextResponse.json({ error: "La consignación ya está archivada." }, { status: 409 });
  }
  if (body.accion === "restaurar" && !consignacion.archivada) {
    return NextResponse.json({ error: "La consignación no está archivada." }, { status: 409 });
  }

  const motivo = body.motivo?.trim() || "duplicada";
  const linea =
    body.accion === "archivar"
      ? `Archivada desde el CRM (motivo: ${motivo}) — reversible con "Restaurar"`
      : `Restaurada desde el CRM (estaba archivada${consignacion.archivada_motivo ? `: ${consignacion.archivada_motivo}` : ""})`;

  try {
    await base44.entity<Base44Consignacion>("Consignacion").update(consignacion.id, {
      archivada: body.accion === "archivar",
      archivada_motivo: body.accion === "archivar" ? motivo : "",
      notas: appendNota(consignacion.notas, linea, rep.full_name),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error al actualizar la consignación" },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true, archivada: body.accion === "archivar" });
}
