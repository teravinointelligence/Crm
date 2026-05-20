// GET /api/consignaciones/retiros/[retiroId]/pdf
// Genera el PDF del retiro de consignación. Auth: admin o el vendedor dueño.

import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { getCurrentRep } from "@/lib/auth";
import { base44, resolveBase44Vendedor, type Base44RetiroConsignacion } from "@/lib/base44";
import { RetiroPdf } from "@/components/consignaciones/RetiroPdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { retiroId: string } }) {
  const rep = await getCurrentRep();
  if (!rep) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  let retiro: Base44RetiroConsignacion;
  try {
    retiro = await base44.entity<Base44RetiroConsignacion>("RetiroConsignacion").get(params.retiroId);
  } catch {
    return NextResponse.json({ error: "Retiro no encontrado" }, { status: 404 });
  }

  // Scope: admin o el vendedor dueño del retiro.
  if (rep.role !== "admin") {
    const v = await resolveBase44Vendedor(rep.email);
    if (!v || v.id !== retiro.vendedor_id) {
      return NextResponse.json({ error: "Retiro no encontrado" }, { status: 404 });
    }
  }

  const buffer = await renderToBuffer(
    RetiroPdf({
      data: {
        numero_retiro: retiro.numero_retiro ?? retiro.id.slice(0, 8),
        fecha: retiro.fecha,
        cliente_nombre: retiro.cliente_nombre ?? "",
        vendedor_nombre: retiro.vendedor_nombre ?? "",
        consignacion_numero: retiro.consignacion_numero ?? "",
        items: (retiro.items ?? []).map((it) => ({
          codigo: it.codigo,
          producto_nombre: it.producto_nombre ?? "—",
          cantidad: Number(it.cantidad ?? 0),
          motivo: it.motivo,
        })),
        total_unidades: Number(retiro.total_unidades ?? 0),
        notas: retiro.notas,
        generatedAt: new Date().toISOString(),
      },
    }),
  );

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="retiro-${retiro.numero_retiro ?? retiro.id}.pdf"`,
    },
  });
}
