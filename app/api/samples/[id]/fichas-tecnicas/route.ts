import { NextResponse } from "next/server";
import { getCurrentRep } from "@/lib/auth";
import { buildSampleTechnicalSheetsArchive } from "@/lib/sample-technical-sheets";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const rep = await getCurrentRep();
  if (!rep) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  // La consulta con sesión conserva RLS: un vendedor solo puede preparar el
  // paquete de una muestra propia; un admin puede hacerlo para cualquiera.
  const supabase = createClient();
  const { data: request } = await supabase
    .from("sample_requests")
    .select("id")
    .eq("id", params.id)
    .maybeSingle();
  if (!request) return NextResponse.json({ error: "Muestra no encontrada" }, { status: 404 });

  const archive = await buildSampleTechnicalSheetsArchive(params.id);
  if (!archive.ok) {
    return NextResponse.json({ error: archive.error }, { status: archive.status });
  }

  const body = archive.buffer.buffer.slice(
    archive.buffer.byteOffset,
    archive.buffer.byteOffset + archive.buffer.byteLength,
  ) as ArrayBuffer;
  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${archive.fileName}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
