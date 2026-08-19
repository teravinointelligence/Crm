"use client";

// Bitácora de notas de la cuenta.
//
// Distinta de las notas de "Mi día" (rep_notes), que son la libreta personal
// del vendedor: estas cuelgan de la cuenta, así que si mañana se reasigna, el
// historial viaja con el cliente. Es donde vive lo que hasta ahora no cabía en
// una cita: el chef nuevo entra en septiembre, piden factura a nombre de la
// matriz, no reciben entregas los lunes.
//
// Escribe directo con el cliente RLS, igual que NoteCard y AccountProposals.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pin, PinOff, StickyNote, Trash2, User } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn, formatDateTime } from "@/lib/utils";
import type { AccountNoteKind, AccountNoteWithAuthor } from "@/types/database";

/** Etiquetas del selector. El orden es el del selector. */
const KIND_LABEL: Record<AccountNoteKind, string> = {
  nota: "Nota",
  acuerdo: "Acuerdo",
  preferencia: "Preferencia",
  incidencia: "Incidencia",
  temporada: "Temporada",
};

const KINDS = Object.keys(KIND_LABEL) as AccountNoteKind[];

const KIND_VARIANT: Record<AccountNoteKind, "muted" | "accent" | "warning" | "success"> = {
  nota: "muted",
  acuerdo: "success",
  preferencia: "accent",
  incidencia: "warning",
  temporada: "accent",
};

const MAX_BODY = 4000;

export function AccountNotes({
  accountId,
  repId,
  repName,
  isAdmin,
  notes: initial,
  canEdit,
}: {
  accountId: string;
  repId: string;
  repName: string | null;
  isAdmin: boolean;
  notes: AccountNoteWithAuthor[];
  /** Puede escribir en esta cuenta (admin o el vendedor asignado). */
  canEdit: boolean;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [notes, setNotes] = useState(initial);
  const [body, setBody] = useState("");
  const [kind, setKind] = useState<AccountNoteKind>("nota");
  const [pending, startTransition] = useTransition();

  /** Fijar y borrar solo lo permite la RLS al autor (o al admin). Si mostráramos
   *  los botones a todos, el vendedor entrante se toparía con un error al tocar
   *  una nota del anterior en vez de entender que no es suya. */
  const puedeGestionar = (note: AccountNoteWithAuthor) =>
    canEdit && (isAdmin || note.sales_rep_id === repId);

  function guardar() {
    const text = body.trim();
    if (!text) return;
    startTransition(async () => {
      const { data, error } = await supabase
        .from("account_notes")
        .insert({
          account_id: accountId,
          sales_rep_id: repId,
          body: text.slice(0, MAX_BODY),
          kind,
        })
        .select("*")
        .single();
      if (error || !data) {
        toast.error("No pudimos guardar la nota", { description: error?.message });
        return;
      }
      setNotes((prev) => [{ ...(data as AccountNoteWithAuthor), author_name: repName }, ...prev]);
      setBody("");
      setKind("nota");
      toast.success("Nota guardada");
      router.refresh();
    });
  }

  function togglePin(note: AccountNoteWithAuthor) {
    startTransition(async () => {
      const { error } = await supabase
        .from("account_notes")
        .update({ pinned: !note.pinned })
        .eq("id", note.id);
      if (error) {
        toast.error("No pudimos fijar la nota", { description: error.message });
        return;
      }
      setNotes((prev) =>
        prev
          .map((n) => (n.id === note.id ? { ...n, pinned: !n.pinned } : n))
          .sort((a, b) =>
            a.pinned === b.pinned
              ? b.created_at.localeCompare(a.created_at)
              : a.pinned
                ? -1
                : 1,
          ),
      );
      router.refresh();
    });
  }

  function borrar(id: string) {
    startTransition(async () => {
      const { error } = await supabase.from("account_notes").delete().eq("id", id);
      if (error) {
        toast.error("No pudimos borrar la nota", { description: error.message });
        return;
      }
      setNotes((prev) => prev.filter((n) => n.id !== id));
      toast.success("Nota borrada");
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <StickyNote className="h-4 w-4 text-brand-carmesi" />
        <h3 className="font-display text-lg">Notas de la cuenta</h3>
        {pending && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
      </div>

      {canEdit && (
        <div className="rounded-lg border bg-card p-3">
          <Textarea
            rows={3}
            value={body}
            maxLength={MAX_BODY}
            placeholder="Lo que hay que saber antes de visitar: acuerdos, preferencias, quién decide, por qué no compran…"
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              // Ctrl/Cmd + Enter guarda, igual que el compositor de "Mi día".
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                guardar();
              }
            }}
          />
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-1.5">
              {KINDS.map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  className={cn(
                    "rounded-full border px-2.5 py-0.5 text-xs transition-colors",
                    kind === k
                      ? "border-brand-carmesi bg-brand-carmesi text-white"
                      : "text-muted-foreground hover:bg-muted",
                  )}
                >
                  {KIND_LABEL[k]}
                </button>
              ))}
            </div>
            <Button size="sm" onClick={guardar} disabled={pending || !body.trim()}>
              <StickyNote className="mr-1 h-3.5 w-3.5" /> Guardar nota
            </Button>
          </div>
        </div>
      )}

      {notes.length === 0 ? (
        <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
          Sin notas todavía. Aquí va lo que no es una cita: acuerdos, preferencias del chef,
          por qué no compran en temporada baja.
        </p>
      ) : (
        <div className="space-y-2">
          {notes.map((n) => (
            <div
              key={n.id}
              className={cn(
                "rounded-lg border bg-card p-3",
                n.pinned && "border-brand-carmesi/40 bg-brand-carmesi/[0.03]",
              )}
            >
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <Badge variant={KIND_VARIANT[n.kind]}>{KIND_LABEL[n.kind] ?? n.kind}</Badge>
                {n.pinned && <Badge variant="accent">Fijada</Badge>}
              </div>
              <p className="whitespace-pre-wrap text-sm">{n.body}</p>
              <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                <span>{formatDateTime(n.created_at)}</span>
                {n.author_name && (
                  <span className="inline-flex items-center gap-1">
                    <User className="h-3 w-3" /> {n.author_name}
                  </span>
                )}
                {puedeGestionar(n) && (
                  <>
                    <button
                      type="button"
                      onClick={() => togglePin(n)}
                      disabled={pending}
                      className="ml-auto inline-flex items-center gap-1 hover:text-brand-carmesi"
                    >
                      {n.pinned ? <PinOff className="h-3 w-3" /> : <Pin className="h-3 w-3" />}
                      {n.pinned ? "Quitar" : "Fijar"}
                    </button>
                    <button
                      type="button"
                      onClick={() => borrar(n.id)}
                      disabled={pending}
                      className="inline-flex items-center gap-1 hover:text-red-600"
                    >
                      <Trash2 className="h-3 w-3" /> Borrar
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
