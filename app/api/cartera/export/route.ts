// GET /api/cartera/export — descarga la cartera de clientes en Excel (.xlsx).
//
// Usa el cliente anon+cookies, así que la vista v_account_balance respeta RLS:
// un vendedor exporta solo la cartera de sus cuentas; admin exporta todo.

import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRep } from "@/lib/auth";
import type { AccountBalance } from "@/types/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function semaforo(pendiente: number, vencido: number): string {
  if (vencido > 0) return "Vencido";
  if (pendiente > 0) return "Por cobrar";
  return "Al día";
}

export async function GET() {
  const rep = await getCurrentRep();
  if (!rep) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const supabase = createClient();
  const [{ data: balances, error }, { data: reps }] = await Promise.all([
    supabase
      .from("v_account_balance")
      .select("*")
      .order("saldo_vencido", { ascending: false })
      .order("saldo_pendiente", { ascending: false }),
    supabase.from("sales_reps").select("id, full_name"),
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const repName = new Map((reps ?? []).map((r) => [r.id, r.full_name]));
  const rows = ((balances ?? []) as AccountBalance[]).filter(
    (b) => (b.total_facturado ?? 0) > 0,
  );

  const data = rows.map((b) => ({
    Cliente: b.business_name ?? "",
    Región: b.region ?? "",
    Vendedor: b.assigned_rep_id ? repName.get(b.assigned_rep_id) ?? "" : "",
    Estatus: semaforo(b.saldo_pendiente ?? 0, b.saldo_vencido ?? 0),
    Facturado: Math.round((b.total_facturado ?? 0) * 100) / 100,
    Pagado: Math.round((b.total_pagado ?? 0) * 100) / 100,
    "Saldo pendiente": Math.round((b.saldo_pendiente ?? 0) * 100) / 100,
    "Saldo vencido": Math.round((b.saldo_vencido ?? 0) * 100) / 100,
    "Facturas abiertas": b.facturas_abiertas ?? 0,
  }));

  // Fila de totales
  const totales = rows.reduce(
    (acc, b) => {
      acc.facturado += b.total_facturado ?? 0;
      acc.pagado += b.total_pagado ?? 0;
      acc.pendiente += b.saldo_pendiente ?? 0;
      acc.vencido += b.saldo_vencido ?? 0;
      acc.abiertas += b.facturas_abiertas ?? 0;
      return acc;
    },
    { facturado: 0, pagado: 0, pendiente: 0, vencido: 0, abiertas: 0 },
  );
  if (data.length) {
    data.push({
      Cliente: "TOTAL",
      Región: "",
      Vendedor: "",
      Estatus: "",
      Facturado: Math.round(totales.facturado * 100) / 100,
      Pagado: Math.round(totales.pagado * 100) / 100,
      "Saldo pendiente": Math.round(totales.pendiente * 100) / 100,
      "Saldo vencido": Math.round(totales.vencido * 100) / 100,
      "Facturas abiertas": totales.abiertas,
    });
  }

  const sheet = XLSX.utils.json_to_sheet(data);
  sheet["!cols"] = [
    { wch: 36 }, // Cliente
    { wch: 16 }, // Región
    { wch: 20 }, // Vendedor
    { wch: 12 }, // Estatus
    { wch: 14 }, // Facturado
    { wch: 14 }, // Pagado
    { wch: 16 }, // Saldo pendiente
    { wch: 14 }, // Saldo vencido
    { wch: 16 }, // Facturas abiertas
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, "Cartera");
  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  const today = new Date().toISOString().slice(0, 10);
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="cartera-${today}.xlsx"`,
    },
  });
}
