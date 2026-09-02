// POST /api/inventario/import — carga un reporte de existencias de CONTPAQ
// ("Inventario actual del almacén por producto") a product_warehouse_stock.
//
// Entrada manual/externa al mismo trabajo que hace el cron de Drive
// (/api/cron/inventario-drive): sirve para subir un archivo suelto desde la
// terminal o desde una automatización sin pasar por la UI.
//
// Seguridad: header Authorization: Bearer <INVENTARIO_IMPORT_TOKEN>. Si no está
// configurado usa CRON_SECRET (ya existe en Vercel). Sin ninguno de los dos el
// endpoint no atiende.
//
// Acepta multipart/form-data (campo `file`) o JSON { fileName, contentBase64 }.
// Campos opcionales: `warehouse` (fuerza la bodega) y `fileDate` (ISO, la fecha
// del archivo; se guarda como last_update para que el CRM muestre "al 7 de
// agosto" y no la hora en que corrió la carga).
//
// `?dryRun=1` hace todo el trabajo (parseo, resolución de códigos, conteos) y
// contesta el mismo resumen SIN escribir nada.

import { NextResponse } from "next/server";
import { importInventarioFile } from "@/lib/inventario/import";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Payload = {
  fileName: string;
  buffer: ArrayBuffer;
  warehouse?: string | null;
  fileDate?: string | null;
};

async function readPayload(req: Request): Promise<Payload | { error: string }> {
  const contentType = req.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return { error: "Falta el archivo en el campo `file`." };
    const fileName = String(form.get("fileName") ?? file.name ?? "").trim();
    if (!fileName) return { error: "Falta el nombre del archivo." };
    return {
      fileName,
      buffer: await file.arrayBuffer(),
      warehouse: form.get("warehouse") ? String(form.get("warehouse")) : null,
      fileDate: form.get("fileDate") ? String(form.get("fileDate")) : null,
    };
  }

  const body = (await req.json().catch(() => null)) as {
    fileName?: string;
    contentBase64?: string;
    warehouse?: string;
    fileDate?: string;
  } | null;
  if (!body?.fileName || !body?.contentBase64) {
    return { error: "Manda multipart con `file` o JSON con { fileName, contentBase64 }." };
  }
  const bytes = Buffer.from(body.contentBase64, "base64");
  if (!bytes.length) return { error: "El contenido en base64 llegó vacío." };
  return {
    fileName: body.fileName.trim(),
    buffer: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    warehouse: body.warehouse ?? null,
    fileDate: body.fileDate ?? null,
  };
}

export async function POST(req: Request) {
  const secret = process.env.INVENTARIO_IMPORT_TOKEN || process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { ok: false, error: "Falta INVENTARIO_IMPORT_TOKEN (o CRON_SECRET) en el entorno." },
      { status: 500 },
    );
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 });
  }

  const dryRun = new URL(req.url).searchParams.get("dryRun") === "1";

  const payload = await readPayload(req);
  if ("error" in payload) {
    return NextResponse.json({ ok: false, error: payload.error }, { status: 400 });
  }

  const { httpStatus, ...result } = await importInventarioFile({ ...payload, dryRun });
  return NextResponse.json(result, { status: httpStatus });
}
