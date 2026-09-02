// /api/samples/[id]/cancelar  POST
//
// Registra una solicitud de cancelacion para revision administrativa.
// El RPC valida nuevamente identidad, propiedad, estado y concurrencia.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRep } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const rep = await getCurrentRep();
  if (!rep) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const supabase = createClient();

  const body = (await req.json().catch(() => ({}))) as { reason?: string };
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 2000) : "";
  if (reason.length < 5) return NextResponse.json({ error: "Escribe el motivo de la cancelación" }, { status: 400 });
  const { data: sampleRequest, error: fetchErr } = await supabase
    .from("sample_requests")
    .select("id, status, sales_rep_id")
    .eq("id", params.id)
    .single();

  if (fetchErr || !sampleRequest) return NextResponse.json({ error: "Solicitud no encontrada" }, { status: 404 });

  const isOwner = sampleRequest.sales_rep_id === rep.id;

  // La verificacion se duplica en el RPC para no confiar solo en esta ruta.
  if (rep.role !== "admin" && !isOwner) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }
  if (!["borrador", "enviada", "aprobada"].includes(sampleRequest.status ?? "")) {
    return NextResponse.json({ error: "No se puede cancelar en el estado actual" }, { status: 400 });
  }

  const { error } = await supabase.rpc("request_sample_cancellation", { p_request_id: params.id, p_reason: reason });
  if (error) return NextResponse.json({ error: error.message }, { status: 409 });

  return NextResponse.json({ ok: true });
}
