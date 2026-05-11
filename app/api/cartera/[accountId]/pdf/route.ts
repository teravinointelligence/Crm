import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import { StatementPdf, type StatementData } from "@/components/cartera/StatementPdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: { accountId: string } },
) {
  const supabase = createClient();

  const { data: account } = await supabase
    .from("accounts")
    .select("business_name, fiscal_name, rfc, region")
    .eq("id", params.accountId)
    .single();
  if (!account) {
    return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 });
  }

  const [{ data: invoices }, { data: payments }, { data: balance }] =
    await Promise.all([
      supabase
        .from("invoices")
        .select("invoice_number, invoice_date, due_date, total, total_paid, balance, status")
        .eq("account_id", params.accountId)
        .neq("status", "cancelada")
        .order("invoice_date", { ascending: true }),
      supabase
        .from("payments")
        .select("payment_date, amount, method, reference")
        .eq("account_id", params.accountId)
        .order("payment_date", { ascending: true }),
      supabase
        .from("v_account_balance")
        .select("*")
        .eq("account_id", params.accountId)
        .single(),
    ]);

  const data: StatementData = {
    account: account as StatementData["account"],
    generatedAt: new Date().toISOString(),
    totals: {
      facturado: Number(balance?.total_facturado ?? 0),
      pagado: Number(balance?.total_pagado ?? 0),
      pendiente: Number(balance?.saldo_pendiente ?? 0),
      vencido: Number(balance?.saldo_vencido ?? 0),
    },
    invoices: ((invoices ?? []) as never[]).map((i: Record<string, unknown>) => ({
      invoice_number: String(i.invoice_number),
      invoice_date: String(i.invoice_date),
      due_date: i.due_date ? String(i.due_date) : null,
      total: Number(i.total ?? 0),
      total_paid: Number(i.total_paid ?? 0),
      balance: Number(i.balance ?? 0),
      status: String(i.status ?? ""),
    })),
    payments: ((payments ?? []) as never[]).map((p: Record<string, unknown>) => ({
      payment_date: String(p.payment_date),
      amount: Number(p.amount ?? 0),
      method: p.method ? String(p.method) : null,
      reference: p.reference ? String(p.reference) : null,
    })),
  };

  const pdf = await renderToBuffer(StatementPdf({ data }));
  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="estado-cuenta-${params.accountId}.pdf"`,
    },
  });
}
