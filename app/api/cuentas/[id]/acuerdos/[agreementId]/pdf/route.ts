import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import { AgreementPdf, type AgreementPdfData } from "@/components/accounts/AgreementPdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: { id: string; agreementId: string } },
) {
  const supabase = createClient();

  const { data: account } = await supabase
    .from("accounts")
    .select("business_name, fiscal_name, rfc, region")
    .eq("id", params.id)
    .single();
  if (!account) {
    return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 });
  }

  const { data: agreement } = await supabase
    .from("agreements")
    .select(
      "id, agreement_date, title, description, type, status, price_notes, discount_pct, credit_days, valid_from, valid_until, contact_id, rep_id",
    )
    .eq("id", params.agreementId)
    .eq("account_id", params.id)
    .single();
  if (!agreement) {
    return NextResponse.json({ error: "Acuerdo no encontrado" }, { status: 404 });
  }

  const [{ data: equipment }, { data: contact }, { data: rep }] = await Promise.all([
    supabase
      .from("agreement_equipment")
      .select("kind, description, quantity, serial, status")
      .eq("agreement_id", params.agreementId)
      .order("created_at", { ascending: true }),
    agreement.contact_id
      ? supabase.from("contacts").select("full_name").eq("id", agreement.contact_id).single()
      : Promise.resolve({ data: null as { full_name: string } | null }),
    agreement.rep_id
      ? supabase.from("sales_reps").select("full_name").eq("id", agreement.rep_id).single()
      : Promise.resolve({ data: null as { full_name: string } | null }),
  ]);

  const data: AgreementPdfData = {
    account: account as AgreementPdfData["account"],
    generatedAt: new Date().toISOString(),
    agreement: {
      agreement_date: String(agreement.agreement_date),
      title: String(agreement.title),
      description: agreement.description ? String(agreement.description) : null,
      type: String(agreement.type),
      status: String(agreement.status),
      price_notes: agreement.price_notes ? String(agreement.price_notes) : null,
      discount_pct: agreement.discount_pct != null ? Number(agreement.discount_pct) : null,
      credit_days: agreement.credit_days != null ? Number(agreement.credit_days) : null,
      valid_from: agreement.valid_from ? String(agreement.valid_from) : null,
      valid_until: agreement.valid_until ? String(agreement.valid_until) : null,
    },
    contactName: contact?.full_name ?? null,
    repName: rep?.full_name ?? null,
    equipment: ((equipment ?? []) as never[]).map((e: Record<string, unknown>) => ({
      kind: String(e.kind),
      description: String(e.description),
      quantity: Number(e.quantity ?? 1),
      serial: e.serial ? String(e.serial) : null,
      status: String(e.status ?? "prestado"),
    })),
  };

  const pdf = await renderToBuffer(AgreementPdf({ data }));
  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="acuerdo-${params.agreementId}.pdf"`,
    },
  });
}
