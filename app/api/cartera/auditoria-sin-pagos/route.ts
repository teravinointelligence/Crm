// GET /api/cartera/auditoria-sin-pagos — descarga (.xlsx) la auditoría de cuentas
// con saldo pendiente pero CERO pagos aplicados (saldo probablemente inflado).
//
// Solo admin: necesita ver TODAS las cuentas. Se genera en vivo, siempre al día.

import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRep } from "@/lib/auth";
import type { AccountBalance } from "@/types/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const rep = await getCurrentRep();
  if (!rep) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (rep.role !== "admin") return NextResponse.json({ error: "Solo admin" }, { status: 403 });

  const supabase = createClient();

  // 1) Cuentas con saldo pendiente y sin pagos (total_pagado = 0).
  const { data: balances, error } = await supabase
    .from("v_account_balance")
    .select("*")
    .eq("total_pagado", 0)
    .gt("saldo_pendiente", 0)
    .order("saldo_pendiente", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (balances ?? []) as AccountBalance[];
  const ids = rows.map((b) => b.account_id);

  if (!ids.length) {
    return NextResponse.json({ error: "No hay cuentas con este patrón" }, { status: 404 });
  }

  // 2) Metadatos de cuenta (# cliente, estatus) y 3) vendedores.
  const [{ data: accts }, { data: reps }] = await Promise.all([
    supabase.from("accounts").select("id, client_number, status, assigned_rep_id").in("id", ids),
    supabase.from("sales_reps").select("id, full_name"),
  ]);
  const acctById = new Map((accts ?? []).map((a) => [a.id, a]));
  const repName = new Map((reps ?? []).map((r) => [r.id, r.full_name]));

  // 4) Antigüedad: min/max fecha de factura abierta por cuenta (paginado).
  const minDate = new Map<string, string>();
  const maxDate = new Map<string, string>();
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data: inv, error: e } = await supabase
      .from("invoices")
      .select("account_id, invoice_date")
      .in("account_id", ids)
      .neq("status", "cancelada")
      .gt("balance", 0)
      .range(from, from + PAGE - 1);
    if (e) return NextResponse.json({ error: e.message }, { status: 500 });
    for (const r of inv ?? []) {
      const d = r.invoice_date as string;
      const acc = r.account_id as string;
      if (!minDate.has(acc) || d < minDate.get(acc)!) minDate.set(acc, d);
      if (!maxDate.has(acc) || d > maxDate.get(acc)!) maxDate.set(acc, d);
    }
    if (!inv || inv.length < PAGE) break;
  }

  const round2 = (n: number) => Math.round(n * 100) / 100;
  const data = rows.map((b) => {
    const a = acctById.get(b.account_id) as { client_number?: string; status?: string; assigned_rep_id?: string } | undefined;
    const repId = b.assigned_rep_id ?? a?.assigned_rep_id;
    const vieja = minDate.get(b.account_id) ?? "";
    return {
      "# Cliente": a?.client_number ?? "",
      Cliente: b.business_name ?? "",
      Estatus: a?.status ?? "",
      Vendedor: repId ? repName.get(repId) ?? "" : "",
      "Facturas abiertas": b.facturas_abiertas ?? 0,
      "Saldo inflado (sin pagos)": round2(b.saldo_pendiente ?? 0),
      "Saldo vencido": round2(b.saldo_vencido ?? 0),
      "Factura más vieja": vieja,
      "Factura más nueva": maxDate.get(b.account_id) ?? "",
      "¿Tiene facturas pre-2024?": vieja && vieja < "2024-01-01" ? "SÍ" : "",
    };
  });

  const totalSaldo = rows.reduce((s, b) => s + (b.saldo_pendiente ?? 0), 0);
  const totalAbiertas = rows.reduce((s, b) => s + (b.facturas_abiertas ?? 0), 0);
  data.push({
    "# Cliente": "TOTAL",
    Cliente: "",
    Estatus: "",
    Vendedor: "",
    "Facturas abiertas": totalAbiertas,
    "Saldo inflado (sin pagos)": round2(totalSaldo),
    "Saldo vencido": 0,
    "Factura más vieja": "",
    "Factura más nueva": "",
    "¿Tiene facturas pre-2024?": "",
  });

  const sheet = XLSX.utils.json_to_sheet(data);
  sheet["!cols"] = [
    { wch: 10 }, { wch: 40 }, { wch: 12 }, { wch: 22 },
    { wch: 16 }, { wch: 22 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 22 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, "Cuentas sin pagos");
  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  const today = new Date().toISOString().slice(0, 10);
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="auditoria-cartera-sin-pagos-${today}.xlsx"`,
    },
  });
}
