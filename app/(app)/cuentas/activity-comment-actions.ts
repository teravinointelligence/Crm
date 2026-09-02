"use server";

import { revalidatePath } from "next/cache";
import { getCurrentRep } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_COMMENT_LENGTH = 2000;

type AddActivityCommentInput = {
  activityId: string;
  body: string;
};

export type AddActivityCommentResult =
  | { ok: true }
  | { ok: false; error: string };

export async function addActivityComment(
  input: AddActivityCommentInput,
): Promise<AddActivityCommentResult> {
  const rep = await getCurrentRep();
  if (!rep) return { ok: false, error: "Tu sesión ya no está activa." };

  const activityId = String(input?.activityId ?? "").trim();
  const body = String(input?.body ?? "").trim();

  if (!UUID_PATTERN.test(activityId)) {
    return { ok: false, error: "La actividad no es válida." };
  }
  if (!body) {
    return { ok: false, error: "Escribe un comentario antes de guardar." };
  }
  if (body.length > MAX_COMMENT_LENGTH) {
    return {
      ok: false,
      error: `El comentario no puede exceder ${MAX_COMMENT_LENGTH} caracteres.`,
    };
  }

  const supabase = createClient();
  const { data: activity, error: activityError } = await supabase
    .from("activities")
    .select("account_id")
    .eq("id", activityId)
    .single();

  if (activityError || !activity) {
    return {
      ok: false,
      error: "No encontramos la actividad o no tienes acceso a ella.",
    };
  }

  const { error } = await supabase.from("activity_comments").insert({
    activity_id: activityId,
    author_rep_id: rep.id,
    body,
  });

  if (error) {
    console.error("No se pudo guardar el comentario de actividad", {
      activityId,
      repId: rep.id,
      code: error.code,
      message: error.message,
    });
    return {
      ok: false,
      error: "No se pudo guardar el comentario. Intenta de nuevo.",
    };
  }

  revalidatePath(`/cuentas/${activity.account_id}`);
  return { ok: true };
}
