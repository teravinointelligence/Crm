// API de archivos del evento (flyer, fotos, SOPs, reportes). Solo admin.
//   POST   /api/eventos/[id]/files  — sube un archivo al bucket `eventos`.
//   DELETE /api/eventos/[id]/files?fileId=...  — elimina un archivo.
import { NextResponse } from "next/server";
import { getCurrentRep } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 25 * 1024 * 1024;
const BUCKET = "eventos";
const TYPES = ["photo", "flyer", "sop_pdf", "report", "other"] as const;

async function requireAdmin() {
  const rep = await getCurrentRep();
  if (!rep) return { rep: null, response: NextResponse.json({ error: "No autenticado" }, { status: 401 }) };
  if (rep.role !== "admin")
    return { rep, response: NextResponse.json({ error: "Solo admin" }, { status: 403 }) };
  return { rep, response: null };
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
  const file = form.get("file");
  const fileType = String(form.get("file_type") || "other");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Adjunta un archivo." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "El archivo supera 25 MB." }, { status: 400 });
  }
  const type = (TYPES as readonly string[]).includes(fileType) ? fileType : "other";

  const db = supabaseAdmin();
  const storage = db.storage.from(BUCKET);
  const ext = file.name.includes(".") ? file.name.split(".").pop() : "bin";
  const path = `${params.id}/${Date.now()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: upErr } = await storage.upload(path, buffer, {
    contentType: file.type || "application/octet-stream",
    upsert: true,
  });
  if (upErr) return NextResponse.json({ error: `No se pudo subir: ${upErr.message}` }, { status: 500 });
  const { data: pub } = storage.getPublicUrl(path);

  const { data: row, error: dbErr } = await db
    .from("event_files")
    .insert({
      event_id: params.id,
      file_url: pub.publicUrl,
      storage_path: path,
      file_name: file.name,
      file_type: type,
      uploaded_by: rep?.id ?? null,
    })
    .select("id")
    .single();
  if (dbErr) {
    await storage.remove([path]);
    return NextResponse.json({ error: dbErr.message }, { status: 500 });
  }

  // Si es flyer, lo dejamos también como flyer_url del evento.
  if (type === "flyer") {
    await db.from("events").update({ flyer_url: pub.publicUrl }).eq("id", params.id);
  }

  return NextResponse.json({ ok: true, id: row.id, file_url: pub.publicUrl });
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const { response } = await requireAdmin();
  if (response) return response;

  const fileId = new URL(req.url).searchParams.get("fileId");
  if (!fileId) return NextResponse.json({ error: "Falta fileId" }, { status: 400 });

  const db = supabaseAdmin();
  const { data: row } = await db
    .from("event_files")
    .select("storage_path, file_url, file_type")
    .eq("id", fileId)
    .eq("event_id", params.id)
    .maybeSingle();

  const { error } = await db.from("event_files").delete().eq("id", fileId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (row?.storage_path) await db.storage.from(BUCKET).remove([row.storage_path]);
  if (row?.file_type === "flyer") {
    await db.from("events").update({ flyer_url: null }).eq("id", params.id);
  }
  return NextResponse.json({ ok: true });
}
