// POST /api/reparto/pedidos/[id]/entregar/upload-url
// Devuelve una URL firmada para que el navegador suba la foto de la factura
// directo a Supabase Storage. Se hace así porque el cuerpo de una ruta API en
// Vercel no puede pasar de ~4.5 MB y una foto del álbum del celular lo supera:
// la subida directa no pasa por la función, así que no tiene ese tope.

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { autorizarEntrega } from "@/lib/reparto/entregas";
import { EXT_POR_TIPO, rutaEvidencia } from "@/lib/reparto/evidencias";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const auth = await autorizarEntrega(params.id);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = (await req.json().catch(() => ({}))) as { tipo?: string };
  const ext = EXT_POR_TIPO[body.tipo ?? ""] ?? "jpg";
  const path = rutaEvidencia(params.id, ext);

  const { data, error } = await supabaseAdmin()
    .storage.from("evidencias")
    .createSignedUploadUrl(path);
  if (error || !data) {
    return NextResponse.json(
      { error: `No se pudo preparar la subida: ${error?.message ?? "sin detalle"}` },
      { status: 500 },
    );
  }

  return NextResponse.json({ path: data.path, token: data.token });
}
