import { NextResponse } from "next/server";
import { getCurrentRep } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUCKET = "fichas-tecnicas";
const MAX_BYTES = 15 * 1024 * 1024;

function safeFileName(value: string) {
  const cleaned = value.replace(/[\r\n"\\/]/g, "_").trim();
  return cleaned || "ficha-tecnica.pdf";
}

function attachmentHeader(fileName: string) {
  const safe = safeFileName(fileName);
  const ascii = safe.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7E]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(safe)}`;
}

async function requireRep() {
  const rep = await getCurrentRep();
  if (!rep) {
    return { rep: null, response: NextResponse.json({ error: "No autenticado" }, { status: 401 }) };
  }
  return { rep, response: null };
}

async function requireAdmin() {
  const auth = await requireRep();
  if (auth.response) return auth;
  if (auth.rep?.role !== "admin") {
    return { rep: auth.rep, response: NextResponse.json({ error: "Solo admin" }, { status: 403 }) };
  }
  return auth;
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const { response } = await requireRep();
  if (response) return response;

  const db = supabaseAdmin();
  const { data: product } = await db
    .from("products")
    .select("name, technical_sheet_path, technical_sheet_file_name")
    .eq("id", params.id)
    .maybeSingle();

  if (!product) return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
  if (!product.technical_sheet_path) {
    return NextResponse.json({ error: "Este producto aún no tiene ficha técnica" }, { status: 404 });
  }

  const { data: pdf, error } = await db.storage.from(BUCKET).download(product.technical_sheet_path);
  if (error || !pdf) {
    return NextResponse.json({ error: "No se pudo descargar la ficha técnica" }, { status: 500 });
  }

  const buffer = Buffer.from(await pdf.arrayBuffer());
  const fileName = product.technical_sheet_file_name || `Ficha técnica - ${product.name}.pdf`;
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(buffer.byteLength),
      "Content-Disposition": attachmentHeader(fileName),
      "Cache-Control": "private, no-store",
    },
  });
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const { rep, response } = await requireAdmin();
  if (response) return response;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "No se pudo leer el formulario" }, { status: 400 });
  }

  const pdf = form.get("pdf");
  if (!(pdf instanceof File) || pdf.size === 0) {
    return NextResponse.json({ error: "Adjunta un archivo PDF" }, { status: 400 });
  }
  if (pdf.type !== "application/pdf" && !pdf.name.toLowerCase().endsWith(".pdf")) {
    return NextResponse.json({ error: "El archivo debe ser un PDF" }, { status: 400 });
  }
  if (pdf.size > MAX_BYTES) {
    return NextResponse.json({ error: "El PDF supera 15 MB" }, { status: 400 });
  }

  const buffer = Buffer.from(await pdf.arrayBuffer());
  if (buffer.subarray(0, 5).toString("ascii") !== "%PDF-") {
    return NextResponse.json({ error: "El archivo no contiene un PDF válido" }, { status: 400 });
  }

  const db = supabaseAdmin();
  const { data: product } = await db
    .from("products")
    .select("id, technical_sheet_path")
    .eq("id", params.id)
    .maybeSingle();
  if (!product) return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });

  const storage = db.storage.from(BUCKET);
  const path = `${product.id}/${Date.now()}.pdf`;
  const { error: uploadError } = await storage.upload(path, buffer, {
    contentType: "application/pdf",
    upsert: false,
  });
  if (uploadError) {
    return NextResponse.json({ error: `No se pudo subir el PDF: ${uploadError.message}` }, { status: 500 });
  }

  const { error: updateError } = await db
    .from("products")
    .update({
      technical_sheet_path: path,
      technical_sheet_file_name: safeFileName(pdf.name),
      technical_sheet_updated_at: new Date().toISOString(),
      technical_sheet_updated_by: rep?.id ?? null,
    })
    .eq("id", product.id);

  if (updateError) {
    await storage.remove([path]);
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  if (product.technical_sheet_path && product.technical_sheet_path !== path) {
    await storage.remove([product.technical_sheet_path]);
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const { response } = await requireAdmin();
  if (response) return response;

  const db = supabaseAdmin();
  const { data: product } = await db
    .from("products")
    .select("id, technical_sheet_path")
    .eq("id", params.id)
    .maybeSingle();
  if (!product) return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });

  const { error } = await db
    .from("products")
    .update({
      technical_sheet_path: null,
      technical_sheet_file_name: null,
      technical_sheet_updated_at: null,
      technical_sheet_updated_by: null,
    })
    .eq("id", product.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (product.technical_sheet_path) {
    await db.storage.from(BUCKET).remove([product.technical_sheet_path]);
  }
  return NextResponse.json({ ok: true });
}
