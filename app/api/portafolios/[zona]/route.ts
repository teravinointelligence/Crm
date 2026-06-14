// API del módulo Portafolios.
//   POST   /api/portafolios/[zona] — sube (o reemplaza) el PDF vigente de la zona.
//   DELETE /api/portafolios/[zona] — elimina el portafolio de la zona.
// Solo admin. El PDF vive en el bucket público `portafolios` bajo <zona>/.

import { NextResponse } from "next/server";
import { getCurrentRep } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { zonaBySlug } from "@/lib/portafolios";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 25 * 1024 * 1024; // 25 MB (los portafolios con imágenes pesan)
const BUCKET = "portafolios";

async function requireAdmin() {
  const rep = await getCurrentRep();
  if (!rep) return { rep: null, response: NextResponse.json({ error: "No autenticado" }, { status: 401 }) };
  if (rep.role !== "admin")
    return { rep, response: NextResponse.json({ error: "Solo admin" }, { status: 403 }) };
  return { rep, response: null };
}

export async function POST(req: Request, { params }: { params: { zona: string } }) {
  const { rep, response } = await requireAdmin();
  if (response) return response;

  const zona = zonaBySlug(params.zona);
  if (!zona) return NextResponse.json({ error: "Zona desconocida" }, { status: 404 });

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
    return NextResponse.json({ error: "El PDF supera 25 MB." }, { status: 400 });
  }

  const db = supabaseAdmin();
  const storage = db.storage.from(BUCKET);

  // Portafolio anterior (para borrar su archivo y no dejar huérfanos).
  const { data: prev } = await db
    .from("portafolios")
    .select("storage_path")
    .eq("zona", zona.slug)
    .maybeSingle();

  const path = `${zona.slug}/${Date.now()}.pdf`;
  const buffer = Buffer.from(await pdf.arrayBuffer());
  const { error: upErr } = await storage.upload(path, buffer, {
    contentType: "application/pdf",
    upsert: true,
  });
  if (upErr) {
    return NextResponse.json({ error: `No se pudo subir el PDF: ${upErr.message}` }, { status: 500 });
  }
  const { data: pub } = storage.getPublicUrl(path);

  const { error: dbErr } = await db.from("portafolios").upsert(
    {
      zona: zona.slug,
      nombre_archivo: pdf.name,
      pdf_url: pub.publicUrl,
      storage_path: path,
      size_bytes: pdf.size,
      updated_by: rep?.id ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "zona" },
  );
  if (dbErr) {
    // Revierte el archivo recién subido para no dejar basura.
    await storage.remove([path]);
    return NextResponse.json({ error: dbErr.message }, { status: 500 });
  }

  // Limpia el PDF anterior (best-effort).
  if (prev?.storage_path && prev.storage_path !== path) {
    await storage.remove([prev.storage_path]);
  }

  return NextResponse.json({ ok: true, pdf_url: pub.publicUrl });
}

export async function DELETE(_req: Request, { params }: { params: { zona: string } }) {
  const { response } = await requireAdmin();
  if (response) return response;

  const zona = zonaBySlug(params.zona);
  if (!zona) return NextResponse.json({ error: "Zona desconocida" }, { status: 404 });

  const db = supabaseAdmin();
  const { data: row } = await db
    .from("portafolios")
    .select("storage_path")
    .eq("zona", zona.slug)
    .maybeSingle();

  const { error: delErr } = await db.from("portafolios").delete().eq("zona", zona.slug);
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

  if (row?.storage_path) {
    await db.storage.from(BUCKET).remove([row.storage_path]);
  }
  return NextResponse.json({ ok: true });
}
