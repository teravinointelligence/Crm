import "server-only";

import JSZip from "jszip";
import { supabaseAdmin } from "@/lib/supabase/admin";

const BUCKET = "fichas-tecnicas";

export function technicalSheetFileStem(value: string) {
  return (
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9_-]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 90) || "producto"
  );
}

function uniqueName(baseName: string, used: Set<string>) {
  let name = baseName;
  let suffix = 2;
  while (used.has(name.toLowerCase())) {
    name = baseName.replace(/\.pdf$/i, `_${suffix}.pdf`);
    suffix += 1;
  }
  used.add(name.toLowerCase());
  return name;
}

type ArchiveSuccess = {
  ok: true;
  buffer: Buffer;
  fileName: string;
  requestNumber: string;
  repEmail: string | null;
  repName: string | null;
  accountName: string | null;
  sheetCount: number;
  pending: string[];
};

type ArchiveFailure = { ok: false; status: number; error: string };

export async function buildSampleTechnicalSheetsArchive(
  sampleId: string,
): Promise<ArchiveSuccess | ArchiveFailure> {
  const db = supabaseAdmin();
  const { data: request } = await db
    .from("sample_requests")
    .select(
      "id, request_number, sales_reps:sales_rep_id(full_name, email), accounts:account_id(business_name), sample_request_items(product_id, product_name)",
    )
    .eq("id", sampleId)
    .maybeSingle();

  if (!request) return { ok: false, status: 404, error: "Muestra no encontrada" };

  const items = (request.sample_request_items ?? []) as Array<{
    product_id: string | null;
    product_name: string;
  }>;
  const uniqueItems = Array.from(
    new Map(items.filter((item) => item.product_id).map((item) => [item.product_id, item])).values(),
  );
  const productIds = uniqueItems
    .map((item) => item.product_id)
    .filter((id): id is string => Boolean(id));

  const { data: products } = productIds.length
    ? await db.from("products").select("id, name, technical_sheet_path").in("id", productIds)
    : { data: [] };
  const sheetsByProduct = new Map(
    ((products ?? []) as Array<{ id: string; name: string; technical_sheet_path: string | null }>).map(
      (product) => [product.id, product],
    ),
  );

  const missing = items
    .filter((item) => !item.product_id || !sheetsByProduct.get(item.product_id)?.technical_sheet_path)
    .map((item) => item.product_name);
  const downloads = await Promise.all(
    uniqueItems.map(async (item) => {
      if (!item.product_id) return null;
      const product = sheetsByProduct.get(item.product_id);
      if (!product?.technical_sheet_path) return null;
      const { data: pdf, error } = await db.storage.from(BUCKET).download(product.technical_sheet_path);
      if (error || !pdf) return { failed: item.product_name } as const;
      return {
        productName: product.name,
        buffer: Buffer.from(await pdf.arrayBuffer()),
      } as const;
    }),
  );

  const zip = new JSZip();
  const usedNames = new Set<string>();
  const failed: string[] = [];
  let sheetCount = 0;
  for (const download of downloads) {
    if (!download) continue;
    if ("failed" in download) {
      if (download.failed) failed.push(download.failed);
      continue;
    }
    zip.file(
      uniqueName(`Ficha_Tecnica_${technicalSheetFileStem(download.productName)}.pdf`, usedNames),
      download.buffer,
    );
    sheetCount += 1;
  }

  if (sheetCount === 0) {
    return {
      ok: false,
      status: 422,
      error: "Ninguno de los productos de esta muestra tiene una ficha técnica disponible",
    };
  }

  const pending = Array.from(new Set([...missing, ...failed]));
  if (pending.length > 0) {
    zip.file(
      "Fichas_pendientes.txt",
      ["Aún faltan fichas técnicas para:", "", ...pending.map((name) => `- ${name}`)].join("\n"),
    );
  }

  const rep = (Array.isArray(request.sales_reps) ? request.sales_reps[0] : request.sales_reps) as
    | { full_name: string | null; email: string | null }
    | null;
  const account = (Array.isArray(request.accounts) ? request.accounts[0] : request.accounts) as
    | { business_name: string | null }
    | null;
  const requestNumber = String(request.request_number || "muestra");

  return {
    ok: true,
    buffer: await zip.generateAsync({
      type: "nodebuffer",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    }),
    fileName: `${technicalSheetFileStem(requestNumber)}_fichas_tecnicas.zip`,
    requestNumber,
    repEmail: rep?.email ?? null,
    repName: rep?.full_name ?? null,
    accountName: account?.business_name ?? null,
    sheetCount,
    pending,
  };
}
