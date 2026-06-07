// POST /api/cartera/conciliacion/save
// Guarda un estado de cuenta ya previsualizado: crea bank_statements, sube el
// archivo original al bucket privado 'estados-cuenta' e inserta bank_transactions.
//
// Body JSON:
//   { bank?, account_label?, account_number?, period_start?, period_end?,
//     file_name?, file_kind?, file_base64?, transactions: BankTxnParsed[] }
//
// Auth: admin o contador (RLS de las tablas exige can_reconcile).

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRep } from "@/lib/auth";
import { canSeeFinance } from "@/lib/modules";
import type { BankTxnParsed } from "@/lib/bank/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  bank?: string | null;
  account_label?: string | null;
  account_number?: string | null;
  period_start?: string | null;
  period_end?: string | null;
  file_name?: string | null;
  file_kind?: "pdf" | "csv" | "xlsx" | null;
  file_base64?: string | null;
  transactions: BankTxnParsed[];
};

export async function POST(req: Request) {
  const rep = await getCurrentRep();
  if (!rep) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!canSeeFinance(rep.role)) {
    return NextResponse.json({ error: "Solo admin o contador pueden conciliar" }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body || !Array.isArray(body.transactions) || body.transactions.length === 0) {
    return NextResponse.json({ error: "Sin transacciones para guardar" }, { status: 400 });
  }

  const supabase = createClient();

  // 1. Crear el estado de cuenta.
  const { data: statement, error: stErr } = await supabase
    .from("bank_statements")
    .insert({
      bank: body.bank || null,
      account_label: body.account_label || null,
      account_number: body.account_number || null,
      period_start: body.period_start || null,
      period_end: body.period_end || null,
      file_name: body.file_name || null,
      file_kind: body.file_kind || null,
      status: "procesado",
      uploaded_by: rep.id,
    })
    .select("id")
    .single();
  if (stErr || !statement) {
    return NextResponse.json({ error: stErr?.message ?? "No se pudo crear el estado de cuenta" }, { status: 500 });
  }

  // 2. Subir el archivo original (si vino) al bucket privado.
  let file_path: string | null = null;
  if (body.file_base64 && body.file_name) {
    const path = `${statement.id}/${body.file_name}`;
    const bytes = Buffer.from(body.file_base64, "base64");
    const contentType =
      body.file_kind === "pdf"
        ? "application/pdf"
        : body.file_kind === "csv"
          ? "text/csv"
          : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    const { error: upErr } = await supabase.storage
      .from("estados-cuenta")
      .upload(path, bytes, { contentType, upsert: true });
    if (!upErr) {
      file_path = path;
      await supabase.from("bank_statements").update({ file_path }).eq("id", statement.id);
    }
    // Si falla la subida, seguimos: las transacciones son lo importante.
  }

  // 3. Insertar las transacciones.
  const rows = body.transactions.map((t, i) => ({
    bank_statement_id: statement.id,
    txn_date: t.txn_date || null,
    description: t.description || "(sin concepto)",
    reference: t.reference || null,
    amount: Math.abs(Number(t.amount) || 0),
    kind: t.kind === "cargo" ? "cargo" : "abono",
    row_index: typeof t.row_index === "number" ? t.row_index : i,
    estado_conciliacion: "sin_conciliar",
  }));
  const { error: txErr } = await supabase.from("bank_transactions").insert(rows);
  if (txErr) {
    return NextResponse.json({ error: txErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, statement_id: statement.id, inserted: rows.length, file_path });
}
