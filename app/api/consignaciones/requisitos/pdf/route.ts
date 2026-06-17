// GET /api/consignaciones/requisitos/pdf — descarga el PDF de "Requisitos para
// consignación" con el membrete TERAVINO. Acepta ?cliente=<nombre> opcional
// para personalizar el encabezado.

import { renderToBuffer } from "@react-pdf/renderer";
import { getCurrentRep } from "@/lib/auth";
import { RequisitosConsignatarioPdf } from "@/components/consignaciones/RequisitosConsignatarioPdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const rep = await getCurrentRep();
  if (!rep) return new Response("No autenticado", { status: 401 });

  const url = new URL(req.url);
  const cliente = url.searchParams.get("cliente")?.trim() || null;

  const buffer = await renderToBuffer(RequisitosConsignatarioPdf({ clientName: cliente }));

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="requisitos-consignacion.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
