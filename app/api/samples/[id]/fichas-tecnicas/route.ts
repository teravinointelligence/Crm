import JSZip from "jszip";
import { NextResponse } from "next/server";
import { getCurrentRep } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUCKET = "fichas-tecnicas";

function fileStem(value: string) {
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

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const rep = await getCurrentRep();
  if (!rep) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  // Este cliente conserva la sesión y RLS decide si el usuario puede ver la
  // solicitud. Así un vendedor no puede descargar fichas de muestras ajenas.
  const supabase = createClient();
  const { data: request } = await supabase
    .from("sample_requests")
    .select("id, request_number, sample_request_items(product_id, product_name)")
    .eq("id", params.id)
    .maybeSingle();

  if (!request) return NextResponse.json({ error: "Muestra no encontrada" }, { status: 404 });

  const items = (request.sample_request_items ?? []) as Array<{
    product_id: string | null;
    product_name: string;
  }>;
  const productIds = Array.from(
    new Set(items.map((item) => item.product_id).filter((id): id is string => Boolean(id))),
  );

  const { data: products } = productIds.length
    ? await supabase
        .from("products")
        .select("id, name, technical_sheet_path")
        .in("id", productIds)
    : { data: [] };

  const sheetsByProduct = new Map(
    ((products ?? []) as Array<{ id: string; name: string; technical_sheet_path: string | null }>).map((product) => [
      product.id,
      product,
    ]),
  );
  const uniqueItems = Array.from(
    new Map(items.filter((item) => item.product_id).map((item) => [item.product_id, item])).values(),
  );
  const missing = items
    .filter((item) => !item.product_id || !sheetsByProduct.get(item.product_id)?.technical_sheet_path)
    .map((item) => item.product_name);

  const db = supabaseAdmin();
  const zip = new JSZip();
  const usedNames = new Set<string>();
  const failed: string[] = [];
  let added = 0;

  for (const item of uniqueItems) {
    if (!item.product_id) continue;
    const product = sheetsByProduct.get(item.product_id);
    if (!product?.technical_sheet_path) continue;

    const { data: pdf, error } = await db.storage.from(BUCKET).download(product.technical_sheet_path);
    if (error || !pdf) {
      failed.push(item.product_name);
      continue;
    }

    const fileName = uniqueName(`Ficha_Tecnica_${fileStem(product.name)}.pdf`, usedNames);
    zip.file(fileName, Buffer.from(await pdf.arrayBuffer()));
    added += 1;
  }

  if (added === 0) {
    return NextResponse.json(
      { error: "Ninguno de los productos de esta muestra tiene una ficha técnica disponible" },
      { status: 404 },
    );
  }

  const pending = Array.from(new Set([...missing, ...failed]));
  if (pending.length > 0) {
    zip.file(
      "Fichas_pendientes.txt",
      ["Aún faltan fichas técnicas para:", "", ...pending.map((name) => `- ${name}`)].join("\n"),
    );
  }

  const output = await zip.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
  const requestNumber = fileStem(request.request_number || "muestra");
  const body = output.buffer.slice(output.byteOffset, output.byteOffset + output.byteLength) as ArrayBuffer;

  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${requestNumber}_fichas_tecnicas.zip"`,
      "Cache-Control": "private, no-store",
    },
  });
}
