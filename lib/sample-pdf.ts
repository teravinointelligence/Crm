// Generación del PDF de una solicitud de muestras. Compartido entre la ruta de
// descarga (/api/samples/[id]/pdf) y el envío por correo (/api/samples/[id]/enviar),
// para que el adjunto del correo sea idéntico al PDF que se descarga.

import "server-only";
import { renderToBuffer } from "@react-pdf/renderer";
import type { createClient } from "@/lib/supabase/server";
import { SampleRequestPdf, type SampleRequestPdfData } from "@/components/samples/SampleRequestPdf";

type DbClient = ReturnType<typeof createClient>;

/** Carga la solicitud y arma el objeto que consume el PDF. `null` si no existe. */
export async function loadSamplePdfData(
  supabase: DbClient,
  id: string,
): Promise<SampleRequestPdfData | null> {
  const { data: req, error } = await supabase
    .from("sample_requests")
    .select(
      "request_number, status, created_at, reason, notes, review_notes, sales_reps:sales_rep_id(full_name), reviewer:reviewed_by(full_name), accounts:account_id(business_name, region), sample_request_items(product_name, supplier, quantity, notes)",
    )
    .eq("id", id)
    .single();
  if (error || !req) return null;

  return {
    request_number: String(req.request_number),
    status: String(req.status ?? ""),
    created_at: (req.created_at as string | null) ?? null,
    reason: (req.reason as string | null) ?? null,
    notes: (req.notes as string | null) ?? null,
    review_notes: (req.review_notes as string | null) ?? null,
    rep: req.sales_reps as unknown as SampleRequestPdfData["rep"],
    reviewer: req.reviewer as unknown as SampleRequestPdfData["reviewer"],
    account: req.accounts as unknown as SampleRequestPdfData["account"],
    items: ((req.sample_request_items ?? []) as never[]).map((i: Record<string, unknown>) => ({
      product_name: String(i.product_name),
      supplier: i.supplier ? String(i.supplier) : null,
      quantity: Number(i.quantity ?? 0),
      notes: i.notes ? String(i.notes) : null,
    })),
  };
}

/** Renderiza el PDF de la solicitud a un Buffer. `null` si la solicitud no existe. */
export async function renderSamplePdf(
  supabase: DbClient,
  id: string,
): Promise<{ buffer: Buffer; requestNumber: string } | null> {
  const data = await loadSamplePdfData(supabase, id);
  if (!data) return null;
  const buffer = await renderToBuffer(SampleRequestPdf({ data }));
  return { buffer, requestNumber: data.request_number };
}
