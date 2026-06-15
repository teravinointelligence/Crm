// POST /api/restock/sugerencias/convertir
//   { items: [{ product_id, name, supplier, quantity }], region_destino?, notes? }
//
// Convierte sugerencias automáticas seleccionadas en un PEDIDO DE RESTOCK real
// (status 'enviada' → entra a la Bandeja de revisión existente). Es la acción
// humana: la IA/modelo sugiere, una persona lo convierte en pedido. Admin only.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRep, isAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

type ItemIn = { product_id?: string | null; name?: string; supplier?: string | null; quantity?: number };

export async function POST(req: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Solo administradores." }, { status: 403 });
  }
  const rep = await getCurrentRep();
  if (!rep) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  let body: { items?: unknown; region_destino?: unknown; notes?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const rawItems = Array.isArray(body.items) ? (body.items as ItemIn[]) : [];
  const items = rawItems
    .map((i) => ({
      product_id: i.product_id ?? null,
      product_name: String(i.name ?? "").trim(),
      supplier: i.supplier ? String(i.supplier).trim() : null,
      quantity_requested: Math.max(0, Math.round(Number(i.quantity ?? 0))),
    }))
    .filter((i) => i.product_name && i.quantity_requested > 0);

  if (!items.length) {
    return NextResponse.json({ error: "No hay productos válidos para el pedido." }, { status: 400 });
  }

  const supabase = createClient();

  // Folio consecutivo (misma función que el alta manual).
  const { data: number, error: numErr } = await supabase.rpc("next_request_number");
  if (numErr || !number) {
    return NextResponse.json({ error: numErr?.message ?? "No se pudo generar el folio." }, { status: 500 });
  }

  const region = typeof body.region_destino === "string" ? body.region_destino : null;
  const notes =
    (typeof body.notes === "string" && body.notes.trim()) ||
    "Generado desde Sugerencias de reabasto.";

  const { data: request, error: reqErr } = await supabase
    .from("restock_requests")
    .insert({
      request_number: number,
      sales_rep_id: rep.id,
      region_destino: region,
      status: "enviada", // entra directo a la bandeja de revisión
      notes,
    })
    .select("id, request_number")
    .single();
  if (reqErr || !request) {
    return NextResponse.json({ error: reqErr?.message ?? "No se pudo crear el pedido." }, { status: 500 });
  }

  const { error: itemsErr } = await supabase.from("restock_request_items").insert(
    items.map((i) => ({ ...i, request_id: request.id })),
  );
  if (itemsErr) {
    return NextResponse.json({ error: itemsErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, request_id: request.id, request_number: request.request_number });
}
