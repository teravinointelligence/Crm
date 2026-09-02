// POST /api/notas — crea una nota libre con sus etiquetas.
//
// Va por API route (y no escritura directa desde el navegador como el resto del
// módulo) porque son dos inserts que dependen: la nota y sus etiquetas. Si las
// etiquetas fallan, la nota se borra para no dejar una a medias.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRep } from "@/lib/auth";

export const dynamic = "force-dynamic";

const MAX_BODY = 4000;
const MAX_TAGS = 20;

type TagInput = { kind: "cuenta" | "contacto"; id: string };

export async function POST(req: Request) {
  const rep = await getCurrentRep();
  if (!rep) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  let payload: { body?: unknown; tags?: unknown };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
  }

  const body = typeof payload.body === "string" ? payload.body.trim() : "";
  if (!body) return NextResponse.json({ error: "La nota está vacía" }, { status: 400 });
  if (body.length > MAX_BODY) {
    return NextResponse.json({ error: "La nota es demasiado larga" }, { status: 400 });
  }

  const rawTags = Array.isArray(payload.tags) ? payload.tags : [];
  if (rawTags.length > MAX_TAGS) {
    return NextResponse.json({ error: "Demasiadas etiquetas" }, { status: 400 });
  }
  const tags: TagInput[] = [];
  const seen = new Set<string>();
  for (const t of rawTags) {
    if (!t || typeof t !== "object") continue;
    const kind = (t as TagInput).kind;
    const id = (t as TagInput).id;
    if ((kind !== "cuenta" && kind !== "contacto") || typeof id !== "string") continue;
    const key = `${kind}:${id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push({ kind, id });
  }

  const supabase = createClient();
  const { data: note, error } = await supabase
    .from("rep_notes")
    .insert({ sales_rep_id: rep.id, body })
    .select("id")
    .single();

  if (error || !note) {
    return NextResponse.json(
      { error: error?.message ?? "No se pudo guardar la nota" },
      { status: 400 },
    );
  }

  if (tags.length) {
    const rows = tags.map((t) => ({
      note_id: (note as { id: string }).id,
      account_id: t.kind === "cuenta" ? t.id : null,
      contact_id: t.kind === "contacto" ? t.id : null,
    }));
    const { error: linkError } = await supabase.from("rep_note_links").insert(rows);
    if (linkError) {
      // Deja la nota sin etiquetar sería peor que no guardarla: el vendedor
      // creería que quedó ligada a la cuenta. Mejor revertir y avisar.
      await supabase.from("rep_notes").delete().eq("id", (note as { id: string }).id);
      return NextResponse.json(
        { error: `No se pudieron guardar las etiquetas: ${linkError.message}` },
        { status: 400 },
      );
    }
  }

  return NextResponse.json({ ok: true, id: (note as { id: string }).id });
}
