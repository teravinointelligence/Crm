// POST /api/cartera/conciliacion/catalogo/commit
// Siembra la memoria de conciliación desde el catálogo: por cada fila resuelta
// (con account_id) registra sus llaves (firma/BNET/RFC) como source 'catalogo'.
//
// Auth: admin o contador.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRep } from "@/lib/auth";
import { canSeeFinance } from "@/lib/modules";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Row = {
  name: string;
  firma: string | null;
  bnet: string | null;
  rfc: string | null;
  account_id: string;
  notes: string | null;
};

export async function POST(req: Request) {
  const rep = await getCurrentRep();
  if (!rep) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!canSeeFinance(rep.role)) {
    return NextResponse.json({ error: "Solo admin o contador" }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as { rows?: Row[] } | null;
  const rows = (body?.rows ?? []).filter((r) => r.account_id);
  if (!rows.length) {
    return NextResponse.json({ error: "No hay filas con cuenta para importar" }, { status: 400 });
  }

  const supabase = createClient();
  let clientes = 0;
  let llaves = 0;

  for (const r of rows) {
    const keys: { kind: string; key: string | null }[] = [
      { kind: "firma", key: r.firma },
      { kind: "bnet", key: r.bnet },
      { kind: "rfc", key: r.rfc },
    ];
    let any = false;
    for (const k of keys) {
      if (!k.key) continue;
      const { error } = await supabase.rpc("learn_payer_key", {
        p_kind: k.kind,
        p_key: k.key,
        p_account_id: r.account_id,
        p_source: "catalogo",
        p_notes: r.notes ?? null,
      });
      if (!error) {
        llaves++;
        any = true;
      }
    }
    if (any) clientes++;
  }

  return NextResponse.json({ ok: true, clientes, llaves });
}
