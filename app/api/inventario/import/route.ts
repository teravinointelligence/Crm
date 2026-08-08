// POST /api/inventario/import — carga un reporte de existencias de CONTPAQ
// ("Inventario actual del almacén por producto") a product_warehouse_stock.
//
// Lo consume el escenario de Make que revisa la carpeta de Drive los lunes,
// miércoles y viernes: por cada .xls nuevo manda el archivo aquí y el CRM se
// encarga de deducir la bodega, resolver los códigos y hacer el upsert. Es la
// misma lógica de Catálogo → Importar → "Inventario por almacén", sin humano.
//
// Seguridad: header Authorization: Bearer <INVENTARIO_IMPORT_TOKEN>. Si no está
// configurado usa CRON_SECRET (ya existe en Vercel). Sin ninguno de los dos el
// endpoint no atiende.
//
// Acepta multipart/form-data (campo `file`) o JSON { fileName, contentBase64 }.
// Campos opcionales: `warehouse` (fuerza la bodega) y `fileDate` (ISO, la fecha
// del archivo en Drive; se guarda como last_update para que el CRM muestre "al
// 7 de agosto" y no la hora en que corrió Make).
//
// `?dryRun=1` hace todo el trabajo (parseo, resolución de códigos, conteos) y
// contesta el mismo resumen SIN escribir nada: sirve para probar un archivo
// nuevo o estrenar el escenario de Make sin tocar el inventario.

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { parseStockExcel } from "@/lib/excel/parseStock";
import { warehouseFromFilename } from "@/lib/inventario/warehouse-from-filename";
import { WAREHOUSES, type Warehouse } from "@/lib/warehouses";

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
  const { fileName, buffer } = payload;

  // Bodega: la forzada por quien llama (si es válida) o la deducida del nombre.
  const forced = payload.warehouse?.trim();
  const warehouse: Warehouse | null = forced
    ? ((WAREHOUSES as readonly string[]).includes(forced) ? (forced as Warehouse) : null)
    : warehouseFromFilename(fileName);
  if (!warehouse) {
    return NextResponse.json(
      {
        ok: false,
        ignored: true,
        reason: "sin_almacen",
        fileName,
        error: `No pude deducir el almacén de "${fileName}". Bodegas válidas: ${WAREHOUSES.join(", ")}.`,
      },
      { status: 422 },
    );
  }

  // Fecha del inventario: la del archivo en Drive; si no viene, ahora.
  const parsedDate = payload.fileDate ? new Date(payload.fileDate) : null;
  const fileDate =
    parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate.toISOString() : new Date().toISOString();

  const db = supabaseAdmin();
  const source = `Excel ${fileName} → ${warehouse}`;

  // Idempotencia: Make puede reintentar o volver a ver el mismo archivo.
  const { data: previo } = await db
    .from("inventory_imports")
    .select("id, imported_at")
    .eq("import_type", "inventario_almacen")
    .eq("source_file_name", source)
    .limit(1);
  let wouldSkip: string | null = previo?.length ? "ya_importado" : null;
  if (wouldSkip && !dryRun) {
    return NextResponse.json({
      ok: true,
      skipped: wouldSkip,
      warehouse,
      fileName,
      importedAt: previo?.[0]?.imported_at,
    });
  }

  // No pisar un inventario más reciente con uno viejo (Make manda por fecha,
  // pero un reintento manual podría traer un archivo atrasado).
  const { data: ultimo } = await db
    .from("product_warehouse_stock")
    .select("last_update")
    .eq("warehouse", warehouse)
    .order("last_update", { ascending: false })
    .limit(1);
  const lastUpdate = ultimo?.[0]?.last_update as string | undefined;
  if (lastUpdate && new Date(fileDate) < new Date(lastUpdate)) {
    wouldSkip = wouldSkip ?? "mas_viejo";
    if (!dryRun) {
      return NextResponse.json({
        ok: true,
        skipped: "mas_viejo",
        warehouse,
        fileName,
        fileDate,
        lastUpdate,
      });
    }
  }

  const { rows, errors } = await parseStockExcel(buffer);
  if (!rows.length) {
    return NextResponse.json(
      {
        ok: false,
        reason: "sin_filas",
        warehouse,
        fileName,
        error: "No encontré filas de producto en el archivo.",
        detalle: errors.slice(0, 5).map((e) => e.message),
      },
      { status: 422 },
    );
  }

  // Código del Excel → product_id. Puede ser el SKU del CRM o el código de
  // CONTPAQ (columna codigo_contpaqi), igual que en la importación manual.
  const skuToId = new Map<string, string>();
  const contpaqToId = new Map<string, string>();
  const keys = rows.map((r) => r.sku);
  for (let i = 0; i < keys.length; i += 200) {
    const slice = keys.slice(i, i + 200);
    const [bySku, byContpaq] = await Promise.all([
      db.from("products").select("id, sku").in("sku", slice),
      db.from("products").select("id, codigo_contpaqi").in("codigo_contpaqi", slice),
    ]);
    if (bySku.error || byContpaq.error) {
      return NextResponse.json(
        { ok: false, error: (bySku.error ?? byContpaq.error)?.message },
        { status: 500 },
      );
    }
    for (const p of bySku.data ?? []) if (p.sku) skuToId.set(String(p.sku), p.id);
    for (const p of byContpaq.data ?? [])
      if (p.codigo_contpaqi) contpaqToId.set(String(p.codigo_contpaqi), p.id);
  }

  const upsert: {
    product_id: string;
    warehouse: Warehouse;
    stock_quantity: number;
    last_update: string;
    last_source: string;
  }[] = [];
  const unresolved: string[] = [];
  for (const r of rows) {
    const productId = skuToId.get(r.sku) ?? contpaqToId.get(r.sku);
    if (!productId) {
      unresolved.push(r.sku);
      continue;
    }
    upsert.push({
      product_id: productId,
      warehouse,
      stock_quantity: r.stock_quantity,
      last_update: fileDate,
      last_source: source,
    });
  }

  if (!upsert.length) {
    return NextResponse.json(
      {
        ok: false,
        reason: "sin_coincidencias",
        warehouse,
        fileName,
        error: `Ninguno de los ${rows.length} códigos del archivo existe en el catálogo (ni por SKU ni por código CONTPAQ).`,
        sinMatch: unresolved.slice(0, 15),
      },
      { status: 422 },
    );
  }

  let rowsOk = 0;
  const fallos: string[] = [];
  if (!dryRun) {
    for (let i = 0; i < upsert.length; i += 500) {
      const chunk = upsert.slice(i, i + 500);
      const { error } = await db
        .from("product_warehouse_stock")
        .upsert(chunk, { onConflict: "product_id,warehouse" });
      if (error) fallos.push(error.message);
      else rowsOk += chunk.length;
    }

    await db.from("inventory_imports").insert({
      import_type: "inventario_almacen",
      source_file_name: source,
      rows_total: rows.length + errors.length,
      rows_ok: rowsOk,
      rows_error: errors.length + unresolved.length + fallos.length,
      error_log: [
        ...errors,
        ...unresolved.map((c) => ({ row: 0, message: `SKU/código ${c} no encontrado` })),
        ...fallos.map((m) => ({ row: 0, message: `Error al guardar: ${m}` })),
      ],
    });
  }

  return NextResponse.json({
    ok: fallos.length === 0,
    dryRun: dryRun || undefined,
    wouldSkip: dryRun ? wouldSkip : undefined,
    warehouse,
    fileName,
    fileDate,
    rowsTotal: rows.length,
    rowsOk: dryRun ? upsert.length : rowsOk,
    conExistencia: upsert.filter((u) => u.stock_quantity > 0).length,
    sinMatch: unresolved.length,
    sinMatchEjemplos: unresolved.slice(0, 15),
    errores: fallos,
  });
}
