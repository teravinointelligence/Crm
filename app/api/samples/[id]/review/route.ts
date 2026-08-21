import { NextResponse } from "next/server";
import { getCurrentRep } from "@/lib/auth";
import { deliverSampleTechnicalSheets } from "@/lib/sample-drive-delivery";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type ReviewState = "aprobada" | "rechazada" | "entregada";

const TRANSITIONS: Record<ReviewState, string[]> = {
  aprobada: ["borrador", "enviada"],
  rechazada: ["borrador", "enviada"],
  entregada: ["aprobada"],
};

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const rep = await getCurrentRep();
  if (!rep) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (rep.role !== "admin") return NextResponse.json({ error: "Solo admin" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as {
    next?: ReviewState;
    reviewNotes?: string;
    addToAccount?: boolean;
    retryDrive?: boolean;
  };
  const db = supabaseAdmin();
  const { data: sample } = await db
    .from("sample_requests")
    .select("id, status, account_id")
    .eq("id", params.id)
    .maybeSingle();
  if (!sample) return NextResponse.json({ error: "Muestra no encontrada" }, { status: 404 });

  if (body.retryDrive) {
    if (!["aprobada", "entregada"].includes(sample.status)) {
      return NextResponse.json({ error: "La muestra aún no está aprobada" }, { status: 409 });
    }
    const delivery = await deliverSampleTechnicalSheets(params.id);
    return NextResponse.json({ ok: delivery.ok, driveUrl: delivery.url, warning: delivery.error });
  }

  if (!body.next || !Object.prototype.hasOwnProperty.call(TRANSITIONS, body.next)) {
    return NextResponse.json({ error: "Acción de revisión inválida" }, { status: 400 });
  }
  if (!TRANSITIONS[body.next].includes(sample.status)) {
    return NextResponse.json(
      { error: `No se puede cambiar una muestra ${sample.status} a ${body.next}` },
      { status: 409 },
    );
  }

  const reviewNotes = typeof body.reviewNotes === "string" ? body.reviewNotes.trim().slice(0, 2000) : "";
  const { error: updateError } = await db
    .from("sample_requests")
    .update({
      status: body.next,
      reviewed_by: rep.id,
      reviewed_at: new Date().toISOString(),
      ...(body.next !== "entregada" ? { review_notes: reviewNotes || null } : {}),
    })
    .eq("id", params.id);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  if (body.next === "entregada" && body.addToAccount !== false) {
    const [{ data: linked }, { data: items }] = await Promise.all([
      db
        .from("sample_request_activities")
        .select("activities:activity_id(account_id)")
        .eq("request_id", params.id),
      db.from("sample_request_items").select("product_id").eq("request_id", params.id),
    ]);
    const linkedAccountIds = (linked ?? []).flatMap((row) => {
      const activity = Array.isArray(row.activities) ? row.activities[0] : row.activities;
      return activity?.account_id ? [activity.account_id as string] : [];
    });
    const accountIds = Array.from(
      new Set(linkedAccountIds.length ? linkedAccountIds : sample.account_id ? [sample.account_id] : []),
    );
    const productIds = Array.from(
      new Set((items ?? []).map((item) => item.product_id).filter((id): id is string => Boolean(id))),
    );
    const rows = accountIds.flatMap((accountId) =>
      productIds.map((productId) => ({
        account_id: accountId,
        product_id: productId,
        status: "muestra",
        added_by: rep.id,
      })),
    );
    if (rows.length > 0) {
      await db.from("account_products").upsert(rows, {
        onConflict: "account_id,product_id",
        ignoreDuplicates: true,
      });
    }
  }

  if (body.next === "aprobada") {
    const delivery = await deliverSampleTechnicalSheets(params.id);
    return NextResponse.json({
      ok: true,
      driveUrl: delivery.url,
      warning: delivery.ok ? null : delivery.error,
    });
  }

  return NextResponse.json({ ok: true });
}
