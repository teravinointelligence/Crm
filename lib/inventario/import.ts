// Núcleo de la carga de un reporte de existencias de CONTPAQ a
// product_warehouse_stock. Lo usan el endpoint POST /api/inventario/import y el
// cron que baja los archivos de Drive (L/M/V), para que ambos caminos hagan
// exactamente lo mismo que Catálogo → Importar → "Inventario por almacén".

import { supabaseAdmin } from "@/lib/supabase/admin";
import { parseStockExcel } from "@/lib/excel/parseStock";
import { warehouseFromFilename } from "@/lib/inventario/warehouse-from-filename";
import { WAREHOUSES, type Warehouse } from "@/lib/warehouses";

export type ImportInput = {
  fileName: string;
  buffer: ArrayBuffer;
  /** Fuerza la bodega; si no viene se deduce del nombre del archivo. */
  warehouse?: string | null;
  /** Fecha del archivo (ISO). Se guarda como last_update. */
  fileDate?: string | null;
  /** Hace todo el análisis sin escribir. */
  dryRun?: boolean;
};

export type ImportResult = {
  ok: boolean;
  httpStatus: number;
  fileName: string;
  warehouse?: Warehouse;
  fileDate?: string;
  /** Por qué no se escribió nada (archivo repetido o más viejo que lo cargado). */
  skipped?: "ya_importado" | "mas_viejo";
  /** Por qué se rechazó el archivo. */
  reason?: "sin_almacen" | "sin_filas" | "sin_coincidencias";
  dryRun?: boolean;
  wouldSkip?: "ya_importado" | "mas_viejo" | null;
  rowsTotal?: number;
  rowsOk?: number;
  conExistencia?: number;
  sinMatch?: number;
  sinMatchEjemplos?: string[];
  errores?: string[];
  error?: string;
  detalle?: string[];
  importedAt?: string;
  lastUpdate?: string;
};

export async function importInventarioFile(input: ImportInput): Promise<ImportResult> {
  const { fileName, buffer, dryRun = false } = input;

  // Bodega: la forzada por quien llama (si es válida) o la deducida del nombre.
  const forced = input.warehouse?.trim();
  const warehouse: Warehouse | null = forced
    ? (WAREHOUSES as readonly string[]).includes(forced)
      ? (forced as Warehouse)
      : null
    : warehouseFromFilename(fileName);
  if (!warehouse) {
    return {
      ok: false,
      httpStatus: 422,
      reason: "sin_almacen",
      fileName,
      error: `No pude deducir el almacén de "${fileName}". Bodegas válidas: ${WAREHOUSES.join(", ")}.`,
    };
  }

  const parsedDate = input.fileDate ? new Date(input.fileDate) : null;
  const fileDate =
    parsedDate && !Number.isNaN(parsedDate.getTime())
      ? parsedDate.toISOString()
      : new Date().toISOString();

  const db = supabaseAdmin();
  const source = `Excel ${fileName} → ${warehouse}`;

  // Idempotencia: el cron vuelve a ver los mismos archivos cada corrida.
  const { data: previo } = await db
    .from("inventory_imports")
    .select("id, imported_at")
    .eq("import_type", "inventario_almacen")
    .eq("source_file_name", source)
    .limit(1);
  let wouldSkip: ImportResult["wouldSkip"] = previo?.length ? "ya_importado" : null;
  if (wouldSkip && !dryRun) {
    return {
      ok: true,
      httpStatus: 200,
      skipped: "ya_importado",
      warehouse,
      fileName,
      importedAt: previo?.[0]?.imported_at as string | undefined,
    };
  }

  // No pisar un inventario más reciente con uno viejo.
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
      return {
        ok: true,
        httpStatus: 200,
        skipped: "mas_viejo",
        warehouse,
        fileName,
        fileDate,
        lastUpdate,
      };
    }
  }

  const { rows, errors } = await parseStockExcel(buffer);
  if (!rows.length) {
    return {
      ok: false,
      httpStatus: 422,
      reason: "sin_filas",
      warehouse,
      fileName,
      error: "No encontré filas de producto en el archivo.",
      detalle: errors.slice(0, 5).map((e) => e.message),
    };
  }

  // Código del Excel → product_id: puede ser el SKU del CRM o el código de
  // CONTPAQ (products.codigo_contpaqi).
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
      return {
        ok: false,
        httpStatus: 500,
        fileName,
        warehouse,
        error: (bySku.error ?? byContpaq.error)?.message,
      };
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
    return {
      ok: false,
      httpStatus: 422,
      reason: "sin_coincidencias",
      warehouse,
      fileName,
      error: `Ninguno de los ${rows.length} códigos del archivo existe en el catálogo (ni por SKU ni por código CONTPAQ).`,
      sinMatchEjemplos: unresolved.slice(0, 15),
    };
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

  return {
    ok: fallos.length === 0,
    httpStatus: 200,
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
  };
}
