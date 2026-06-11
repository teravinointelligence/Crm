// POST /api/consignaciones/[id]/eliminar
//
// ⚠️ ELIMINACIÓN DEFINITIVA E IRREVERSIBLE de una consignación en Base44.
// Defensas en capas (todas obligatorias):
//   1. Solo admin.
//   2. Solo consignaciones YA ARCHIVADAS (primero archivar → revisar → borrar).
//   3. El body debe traer `confirmacion` con el nombre EXACTO del cliente
//      (la UI obliga a teclearlo — doble confirmación).
//   4. No se borran consignaciones con movimientos (vendidas/devueltas/cobros):
//      eso es historial operativo, no basura.
// Las tomas vinculadas NO se borran; quedarían huérfanas a propósito (visibles
// en /consignaciones/tomas para re-vincular si hace falta).

import { NextResponse } from "next/server";
import { getCurrentRep } from "@/lib/auth";
import { canAccessFacturacion } from "@/lib/modules";
import { base44, type Base44Consignacion } from "@/lib/base44";

type Body = {
  confirmacion: string;
};

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const rep = await getCurrentRep();
  if (!rep) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!canAccessFacturacion(rep.role)) {
    return NextResponse.json({ error: "Solo un admin puede eliminar consignaciones." }, { status: 403 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Body inválido (JSON)" }, { status: 400 });
  }

  let consignacion: Base44Consignacion;
  try {
    consignacion = await base44.entity<Base44Consignacion>("Consignacion").get(params.id);
  } catch {
    return NextResponse.json({ error: "Consignación no encontrada" }, { status: 404 });
  }

  if (!consignacion.archivada) {
    return NextResponse.json(
      { error: "Solo se pueden eliminar consignaciones archivadas. Archívala primero (es reversible) y revisa con calma." },
      { status: 409 },
    );
  }

  const tieneMovimientos =
    Number(consignacion.cantidad_vendida ?? 0) > 0 ||
    Number(consignacion.cantidad_devuelta ?? 0) > 0 ||
    Number(consignacion.monto_cobrado ?? 0) > 0;
  if (tieneMovimientos) {
    return NextResponse.json(
      { error: "Esta consignación tiene movimientos registrados (ventas/devoluciones/cobros). Es historial operativo — no se puede eliminar." },
      { status: 409 },
    );
  }

  const esperado = (consignacion.cliente_nombre ?? "").trim();
  if (!esperado || body.confirmacion?.trim() !== esperado) {
    return NextResponse.json(
      { error: `Confirmación incorrecta: escribe exactamente el nombre del cliente ("${esperado}").` },
      { status: 400 },
    );
  }

  try {
    await base44.entity<Base44Consignacion>("Consignacion").delete(consignacion.id);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error al eliminar en Base44" },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true, eliminada: consignacion.id });
}
