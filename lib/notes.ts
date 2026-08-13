// Notas libres del vendedor. SERVER-ONLY.
//
// Una nota es texto y, opcionalmente, etiquetas a cuentas y contactos. Todo va
// con el cliente RLS, así que el universo ya queda acotado al vendedor: nadie
// puede etiquetar una cuenta que no le toca.

import "server-only";
import type { createClient } from "@/lib/supabase/server";
import type { NoteTag, NoteWithTags, RepNote } from "@/types/database";

type DbClient = ReturnType<typeof createClient>;

/** Cuántas notas recientes se muestran en "Mi día". */
export const NOTES_PAGE_SIZE = 20;

type LinkRow = {
  note_id: string;
  account_id: string | null;
  contact_id: string | null;
};

/**
 * Resuelve las etiquetas de un conjunto de notas a nombres. Se hace en dos
 * consultas (cuentas y contactos) en vez de con joins anidados de PostgREST
 * porque el contacto necesita además el nombre de SU cuenta para el enlace.
 */
async function resolveTags(
  supabase: DbClient,
  noteIds: string[],
): Promise<Map<string, NoteTag[]>> {
  const byNote = new Map<string, NoteTag[]>();
  if (!noteIds.length) return byNote;

  const { data: linkData } = await supabase
    .from("rep_note_links")
    .select("note_id, account_id, contact_id")
    .in("note_id", noteIds);
  const links = (linkData ?? []) as LinkRow[];
  if (!links.length) return byNote;

  const accountIds = [...new Set(links.map((l) => l.account_id).filter(Boolean))] as string[];
  const contactIds = [...new Set(links.map((l) => l.contact_id).filter(Boolean))] as string[];

  const [accountsRes, contactsRes] = await Promise.all([
    accountIds.length
      ? supabase.from("accounts").select("id, business_name").in("id", accountIds)
      : Promise.resolve({ data: [] }),
    contactIds.length
      ? supabase.from("contacts").select("id, full_name, account_id").in("id", contactIds)
      : Promise.resolve({ data: [] }),
  ]);

  const accountName = new Map(
    ((accountsRes.data ?? []) as { id: string; business_name: string | null }[]).map((a) => [
      a.id,
      a.business_name ?? "(sin nombre)",
    ]),
  );
  const contactById = new Map(
    ((contactsRes.data ?? []) as { id: string; full_name: string; account_id: string }[]).map(
      (c) => [c.id, c],
    ),
  );

  for (const l of links) {
    const list = byNote.get(l.note_id) ?? [];
    if (l.account_id) {
      // Una cuenta borrada deja de resolverse: se omite en vez de pintar vacío.
      const name = accountName.get(l.account_id);
      if (name) list.push({ kind: "cuenta", id: l.account_id, name });
    } else if (l.contact_id) {
      const c = contactById.get(l.contact_id);
      if (c) {
        list.push({ kind: "contacto", id: c.id, name: c.full_name, accountId: c.account_id });
      }
    }
    byNote.set(l.note_id, list);
  }
  return byNote;
}

/** Notas recientes del vendedor (fijadas primero). */
export async function loadNotes(
  supabase: DbClient,
  repId: string,
  limit = NOTES_PAGE_SIZE,
): Promise<NoteWithTags[]> {
  const { data } = await supabase
    .from("rep_notes")
    .select("*")
    .eq("sales_rep_id", repId)
    .order("pinned", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  const notes = (data ?? []) as RepNote[];
  const tags = await resolveTags(
    supabase,
    notes.map((n) => n.id),
  );
  return notes.map((n) => ({ ...n, tags: tags.get(n.id) ?? [] }));
}

/** Notas etiquetadas a una cuenta, para el panel de la ficha del cliente. */
export async function loadNotesForAccount(
  supabase: DbClient,
  accountId: string,
  limit = 10,
): Promise<NoteWithTags[]> {
  const { data: linkData } = await supabase
    .from("rep_note_links")
    .select("note_id")
    .eq("account_id", accountId);
  const noteIds = [...new Set(((linkData ?? []) as { note_id: string }[]).map((l) => l.note_id))];
  if (!noteIds.length) return [];

  const { data } = await supabase
    .from("rep_notes")
    .select("*")
    .in("id", noteIds)
    .order("created_at", { ascending: false })
    .limit(limit);

  const notes = (data ?? []) as RepNote[];
  const tags = await resolveTags(
    supabase,
    notes.map((n) => n.id),
  );
  return notes.map((n) => ({ ...n, tags: tags.get(n.id) ?? [] }));
}
