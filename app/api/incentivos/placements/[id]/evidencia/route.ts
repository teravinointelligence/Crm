// POST /api/incentivos/placements/[id]/evidencia — el vendedor adjunta la
// evidencia de su encarte (foto de la carta del restaurante o PDF). Sube al
// bucket público `evidencias` bajo `incentivos/` y guarda la URL en el
// placement. Solo el dueño del encarte (o admin), y solo si sigue pendiente.

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getCurrentRep } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const TIPOS = ["image/jpeg", "image/png", "image/webp", "image/heic", "application/pdf"];

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const rep = await getCurrentRep();
  if (!rep) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const admin = supabaseAdmin();
  const { data: placement } = await admin
    .from("incentive_placements")
    .select("id, rep_id, estado, client_number")
    .eq("id", params.id)
    .maybeSingle();
  if (!placement) return NextResponse.json({ error: "Encarte no encontrado" }, { status: 404 });
  if (placement.rep_id !== rep.id && rep.role !== "admin") {
    return NextResponse.json({ error: "Este encarte no es tuyo" }, { status: 403 });
  }
  if (placement.estado !== "pendiente" && placement.estado !== "en_revision") {
    return NextResponse.json({ error: "El encarte ya fue resuelto" }, { status: 409 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "No se pudo leer el formulario" }, { status: 400 });
  }
  const file = form.get("evidencia");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Adjunta una imagen o PDF." }, { status: 400 });
  }
  if (!TIPOS.includes(file.type)) {
    return NextResponse.json({ error: "Formato no soportado (usa foto o PDF)." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Máximo 5 MB." }, { status: 400 });
  }

  const ext = file.type === "application/pdf" ? "pdf" : (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `incentivos/${placement.id}.${ext}`;
  const { error: upErr } = await admin.storage
    .from("evidencias")
    .upload(path, await file.arrayBuffer(), { contentType: file.type, upsert: true });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  const { data: pub } = admin.storage.from("evidencias").getPublicUrl(path);
  const { error: updErr } = await admin
    .from("incentive_placements")
    .update({ evidencia_url: pub.publicUrl })
    .eq("id", placement.id);
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, url: pub.publicUrl });
}
