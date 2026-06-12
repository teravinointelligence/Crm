// POST /api/reparto/pedidos/[id]/pdf — adjunta el PDF del documento del
// pedido (factura, traspaso de almacén, consignación, patrocinio…).
// Sube al bucket público `evidencias` bajo `documentos/` y guarda la URL
// en reparto.pedidos.pdf_url (reemplaza si ya había uno).

import { NextResponse } from "next/server";
import { repartoAdmin } from "@/lib/supabase-reparto";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireRepartoManage } from "../../../_lib/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const { response } = await requireRepartoManage();
  if (response) return response;

  const { data: pedido } = await repartoAdmin
    .from("pedidos")
    .select("id, numero_factura")
    .eq("id", params.id)
    .maybeSingle();
  if (!pedido) return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "No se pudo leer el formulario" }, { status: 400 });
  }
  const pdf = form.get("pdf");
  if (!(pdf instanceof File) || pdf.size === 0) {
    return NextResponse.json({ error: "Adjunta un archivo PDF." }, { status: 400 });
  }
  if (pdf.type !== "application/pdf" && !pdf.name.toLowerCase().endsWith(".pdf")) {
    return NextResponse.json({ error: "El archivo debe ser un PDF." }, { status: 400 });
  }
  if (pdf.size > MAX_BYTES) {
    return NextResponse.json({ error: "El PDF supera 10 MB." }, { status: 400 });
  }

  const path = `documentos/${params.id}_${Date.now()}.pdf`;
  const buffer = Buffer.from(await pdf.arrayBuffer());
  const storage = supabaseAdmin().storage.from("evidencias");
  const { error: upErr } = await storage.upload(path, buffer, {
    contentType: "application/pdf",
    upsert: true,
  });
  if (upErr) {
    return NextResponse.json({ error: `No se pudo subir el PDF: ${upErr.message}` }, { status: 500 });
  }
  const { data: pub } = storage.getPublicUrl(path);

  const { error: updErr } = await repartoAdmin
    .from("pedidos")
    .update({ pdf_url: pub.publicUrl })
    .eq("id", params.id);
  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, pdf_url: pub.publicUrl });
}
