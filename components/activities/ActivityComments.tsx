"use client";

import { type FormEvent, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, MessageSquareText, Send } from "lucide-react";
import { toast } from "sonner";
import {
  addActivityComment,
} from "@/app/(app)/cuentas/activity-comment-actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTime } from "@/lib/utils";
import type { ActivityCommentWithAuthor } from "@/types/database";

const MAX_COMMENT_LENGTH = 2000;

type ActivityCommentsProps = {
  activityId: string;
  comments: ActivityCommentWithAuthor[];
  currentRepId: string;
};

export function ActivityComments({
  activityId,
  comments,
  currentRepId,
}: ActivityCommentsProps) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [saving, startSaving] = useTransition();
  const sortedComments = useMemo(
    () => [...comments].sort((a, b) => a.created_at.localeCompare(b.created_at)),
    [comments],
  );
  const inputId = `activity-comment-${activityId}`;

  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedBody = body.trim();
    if (!trimmedBody || saving) return;

    startSaving(async () => {
      try {
        const result = await addActivityComment({
          activityId,
          body: trimmedBody,
        });
        if (!result.ok) {
          toast.error("No se pudo guardar el comentario", {
            description: result.error,
          });
          return;
        }

        setBody("");
        toast.success("Comentario agregado al seguimiento");
        router.refresh();
      } catch (error) {
        toast.error("No se pudo guardar el comentario", {
          description:
            error instanceof Error ? error.message : "Intenta de nuevo.",
        });
      }
    });
  };

  return (
    <section className="mt-4 border-t pt-3" aria-label="Seguimiento conjunto">
      <div className="flex items-center gap-2 text-sm font-medium">
        <MessageSquareText className="h-4 w-4 text-brand-carmesi" />
        <span>Seguimiento conjunto</span>
        {sortedComments.length > 0 && (
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
            {sortedComments.length}
          </span>
        )}
      </div>

      {sortedComments.length > 0 ? (
        <div className="mt-3 space-y-2">
          {sortedComments.map((comment) => (
            <article key={comment.id} className="rounded-md bg-muted/50 px-3 py-2">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <p className="text-xs font-medium text-foreground">
                  {comment.author?.full_name ?? "Usuario"}
                  {comment.author_rep_id === currentRepId ? " · Tú" : ""}
                </p>
                <time
                  className="text-[11px] text-muted-foreground"
                  dateTime={comment.created_at}
                >
                  {formatDateTime(comment.created_at)}
                </time>
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm text-foreground/90">
                {comment.body}
              </p>
            </article>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">
          Todavía no hay comentarios de seguimiento.
        </p>
      )}

      <form className="mt-3 space-y-2" onSubmit={save}>
        <label htmlFor={inputId} className="text-xs font-medium">
          Añadir comentario
        </label>
        <Textarea
          id={inputId}
          value={body}
          rows={2}
          maxLength={MAX_COMMENT_LENGTH}
          disabled={saving}
          placeholder="Escribe una actualización, pregunta o acuerdo…"
          className="min-h-[64px] resize-y"
          onChange={(event) => setBody(event.target.value)}
        />
        <div className="flex items-center justify-between gap-3">
          <span className="text-[11px] text-muted-foreground">
            {body.length}/{MAX_COMMENT_LENGTH}
          </span>
          <Button type="submit" size="sm" disabled={saving || !body.trim()}>
            {saving ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="mr-1.5 h-3.5 w-3.5" />
            )}
            {saving ? "Guardando…" : "Comentar"}
          </Button>
        </div>
      </form>
    </section>
  );
}
