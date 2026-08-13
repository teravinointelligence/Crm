"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Building2, Loader2, Pin, PinOff, Trash2, User } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { cn, formatDateTime } from "@/lib/utils";
import type { NoteWithTags } from "@/types/database";

export function NoteCard({ note }: { note: NoteWithTags }) {
  const router = useRouter();
  const supabase = createClient();
  const [pending, startTransition] = useTransition();
  const [gone, setGone] = useState(false);

  const togglePin = () => {
    startTransition(async () => {
      const { error } = await supabase
        .from("rep_notes")
        .update({ pinned: !note.pinned })
        .eq("id", note.id);
      if (error) {
        toast.error("No pudimos fijar la nota", { description: error.message });
        return;
      }
      router.refresh();
    });
  };

  const remove = () => {
    setGone(true);
    startTransition(async () => {
      // Las etiquetas se van solas: rep_note_links es on delete cascade.
      const { error } = await supabase.from("rep_notes").delete().eq("id", note.id);
      if (error) {
        setGone(false);
        toast.error("No pudimos borrar la nota", { description: error.message });
        return;
      }
      toast.success("Nota borrada");
      router.refresh();
    });
  };

  return (
    <div
      className={cn(
        "rounded-lg border bg-card p-3 transition-opacity duration-200",
        note.pinned && "border-brand-carmesi/40 bg-brand-carmesi/[0.03]",
        gone && "pointer-events-none opacity-0",
      )}
    >
      <p className="whitespace-pre-wrap text-sm">{note.body}</p>

      {note.tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {note.tags.map((t) => (
            <Link
              key={`${t.kind}-${t.id}`}
              href={
                t.kind === "cuenta"
                  ? `/cuentas/${t.id}`
                  : `/cuentas/${t.accountId}?tab=contactos`
              }
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors",
                t.kind === "cuenta"
                  ? "border-brand-carmesi/30 bg-brand-carmesi/10 text-brand-carmesi hover:bg-brand-carmesi/20"
                  : "border-border bg-muted text-muted-foreground hover:bg-muted/70",
              )}
            >
              {t.kind === "cuenta" ? (
                <Building2 className="h-3 w-3" />
              ) : (
                <User className="h-3 w-3" />
              )}
              {t.name}
            </Link>
          ))}
        </div>
      )}

      <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
        <span>{formatDateTime(note.created_at)}</span>
        {pending && <Loader2 className="h-3 w-3 animate-spin" />}
        <button
          type="button"
          onClick={togglePin}
          disabled={pending}
          className="ml-auto inline-flex items-center gap-1 hover:text-brand-carmesi"
        >
          {note.pinned ? <PinOff className="h-3 w-3" /> : <Pin className="h-3 w-3" />}
          {note.pinned ? "Quitar" : "Fijar"}
        </button>
        <button
          type="button"
          onClick={remove}
          disabled={pending}
          className="inline-flex items-center gap-1 hover:text-red-600"
        >
          <Trash2 className="h-3 w-3" /> Borrar
        </button>
      </div>
    </div>
  );
}
