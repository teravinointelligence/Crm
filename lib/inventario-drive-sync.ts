// Orquestación del puente Drive → product_warehouse_stock.
// SERVER-ONLY: descarga de Drive y escribe con service-role.
//
// Replica lo que hace a mano el importador de Catálogo (ImportExcelClient,
// modo "almacen"): mismo parser, mismo emparejado de SKU, misma tabla y misma
// bitácora. La diferencia es que aquí el archivo llega de Drive en vez de un
// <input type=file>, y el rollup de la migración 0081 recalcula solo el
// products.stock_quantity.

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseStockExcel } from "@/lib/excel/parseStock";
import { listFolder, downloadFile } from "@/lib/google-drive";
import {
  pickLatestPerWarehouse,
  type Candidate,
  type SkippedFile,
} from "@/lib/inventario-drive";
import type { Warehouse } from "@/lib/warehouses";

export type WarehouseResult = {
  warehouse: Warehouse;
  file: string;
  status: "actualizado" | "sin cambios" | "error";
  rowsOk: number;
  rowsError: number;
  detail?: string;
};

export type SyncSummary = {
  candidates: number;
  updated: number;
  unchanged: number;
  failed: number;
  results: WarehouseResult[];
  skipped: SkippedFile[];
};

// ¿Este archivo exacto (mismo id, misma fecha de modificación) ya se importó
// con éxito? Evita reprocesar el mismo corte todos los días.
async function alreadyImported(
  supabase: SupabaseClient,
  fileId: string,
  modifiedTime: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("inventory_imports")
    .select("id")
    .eq("source_file_id", fileId)
    .gte("source_modified_at", modifiedTime)
    .gt("rows_ok", 0)
    .limit(1);

  if (error) {
    // Ante la duda, procesa: la importación es idempotente (upsert), así que
    // repetir es inofensivo; saltarse un corte nuevo no lo es.
    return false;
  }
  return (data?.length ?? 0) > 0;
}

// Mapea los códigos del Excel a product_id. Un producto puede empatar por
// products.sku o por products.codigo_contpaqi (migración 0061).
async function resolveProductIds(
  supabase: SupabaseClient,
  codes: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();

  for (let i = 0; i < codes.length; i += 200) {
    const slice = codes.slice(i, i + 200);
    const [bySku, byContpaq] = await Promise.all([
      supabase.from("products").select("id, sku").in("sku", slice),
      supabase.from("products").select("id, codigo_contpaqi").in("codigo_contpaqi", slice),
    ]);
    if (bySku.error) throw new Error(`Error al buscar productos: ${bySku.error.message}`);
    if (byContpaq.error) {
      throw new Error(`Error al buscar productos: ${byContpaq.error.message}`);
    }

    // El SKU propio gana sobre el código de CONTPAQi cuando ambos empatan.
    for (const p of byContpaq.data ?? []) {
      if (p.codigo_contpaqi) map.set(p.codigo_contpaqi, p.id);
    }
    for (const p of bySku.data ?? []) {
      if (p.sku) map.set(p.sku, p.id);
    }
  }

  return map;
}

async function syncOne(
  supabase: SupabaseClient,
  { file, warehouse }: Candidate,
): Promise<WarehouseResult> {
  const base = { warehouse, file: file.name };

  if (await alreadyImported(supabase, file.id, file.modifiedTime)) {
    return { ...base, status: "sin cambios", rowsOk: 0, rowsError: 0 };
  }

  const buf = await downloadFile(file.id);
  const { rows, errors } = await parseStockExcel(buf);

  if (!rows.length) {
    const detail = errors[0]?.message ?? "El archivo no traía filas de producto.";
    return { ...base, status: "error", rowsOk: 0, rowsError: errors.length, detail };
  }

  const ids = await resolveProductIds(
    supabase,
    [...new Set(rows.map((r) => r.sku))],
  );

  const now = new Date().toISOString();
  const source = `Drive: ${file.name}`;
  const notFound: { row: number; message: string }[] = [];
  const payload = [];

  for (const r of rows) {
    const productId = ids.get(r.sku);
    if (!productId) {
      notFound.push({ row: 0, message: `SKU/código ${r.sku} no encontrado` });
      continue;
    }
    payload.push({
      product_id: productId,
      warehouse,
      stock_quantity: r.stock_quantity,
      last_update: now,
      last_source: source,
    });
  }

  const writeErrors: { row: number; message: string }[] = [];
  let ok = 0;
  for (let i = 0; i < payload.length; i += 500) {
    const chunk = payload.slice(i, i + 500);
    const { error } = await supabase
      .from("product_warehouse_stock")
      .upsert(chunk, { onConflict: "product_id,warehouse" });
    if (error) {
      writeErrors.push({ row: 0, message: `Error al guardar: ${error.message}` });
    } else {
      ok += chunk.length;
    }
  }

  const allErrors = [...errors, ...notFound, ...writeErrors];
  await supabase.from("inventory_imports").insert({
    imported_by: null, // corre sin sesión (cron)
    import_type: "inventario_almacen",
    source_file_name: source,
    source_file_id: file.id,
    source_modified_at: file.modifiedTime,
    rows_total: rows.length + errors.length,
    rows_ok: ok,
    rows_error: allErrors.length,
    error_log: allErrors as never,
  });

  if (ok === 0) {
    return {
      ...base,
      status: "error",
      rowsOk: 0,
      rowsError: allErrors.length,
      detail: writeErrors[0]?.message ?? "Ningún código del archivo empató con el catálogo.",
    };
  }

  return {
    ...base,
    status: "actualizado",
    rowsOk: ok,
    rowsError: allErrors.length,
    detail: notFound.length ? `${notFound.length} códigos sin producto en el catálogo` : undefined,
  };
}

export async function runInventarioDriveSync(
  supabase: SupabaseClient,
): Promise<SyncSummary> {
  const folderId = process.env.GOOGLE_DRIVE_INVENTARIOS_FOLDER_ID;
  if (!folderId) {
    throw new Error(
      "Falta GOOGLE_DRIVE_INVENTARIOS_FOLDER_ID en el entorno (id de la carpeta " +
        "de Drive donde se suben los cortes de inventario).",
    );
  }

  const files = await listFolder(folderId);
  const { candidates, skipped } = pickLatestPerWarehouse(files);

  const results: WarehouseResult[] = [];
  for (const candidate of candidates) {
    try {
      results.push(await syncOne(supabase, candidate));
    } catch (e) {
      results.push({
        warehouse: candidate.warehouse,
        file: candidate.file.name,
        status: "error",
        rowsOk: 0,
        rowsError: 0,
        detail: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return {
    candidates: candidates.length,
    updated: results.filter((r) => r.status === "actualizado").length,
    unchanged: results.filter((r) => r.status === "sin cambios").length,
    failed: results.filter((r) => r.status === "error").length,
    results,
    skipped,
  };
}
