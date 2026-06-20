// POST /api/orders/[id]/surtido
//
// Cambia el estado de SURTIDO de un pedido (por_surtir ↔ surtido) y, de paso,
// permite fijar/corregir el almacén de salida. Es una marca operativa: NO toca
// el inventario. Solo admin o jefe_logistica (Isaí).

import { NextResponse } from "next/server";
import { getCurrentRep } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { WAREHOUSES } from "@/lib/warehouses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const rep = await getCurrentRep();
  if (!rep) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!["admin", "jefe_logistica"].includes(rep.role ?? "")) {
    return NextResponse.json(
      { error: "Solo admin o logística pueden marcar el surtido" },
      { status: 403 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as {
    fulfillment_status?: string;
    warehouse?: string | null;
  };

  const update: Record<string, unknown> = {};

  if (body.fulfillment_status !== undefined) {
    if (!["por_surtir", "surtido"].includes(body.fulfillment_status)) {
      return NextResponse.json({ error: "Estado de surtido inválido" }, { status: 400 });
    }
    update.fulfillment_status = body.fulfillment_status;
    if (body.fulfillment_status === "surtido") {
      update.fulfilled_at = new Date().toISOString();
      update.fulfilled_by = rep.id;
    } else {
      update.fulfilled_at = null;
      update.fulfilled_by = null;
    }
  }

  if (body.warehouse !== undefined) {
    if (body.warehouse !== null && !WAREHOUSES.includes(body.warehouse as (typeof WAREHOUSES)[number])) {
      return NextResponse.json({ error: "Almacén inválido" }, { status: 400 });
    }
    update.warehouse = body.warehouse;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Nada que actualizar" }, { status: 400 });
  }

  const supabase = createClient();
  const { error } = await supabase.from("orders").update(update).eq("id", params.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
