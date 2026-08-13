// GET /api/cron/inventario-drive — Vercel Cron (lunes, miércoles y viernes 9am
// hora BCS/Mazatlán). Baja de Drive los reportes de existencias de CONTPAQ que
// Sabrina exportó y los carga a product_warehouse_stock, uno por bodega.
//
// De cada almacén se toma SOLO el archivo más reciente de la ventana; el resto
// se ignora. La carga en sí (deducir bodega, resolver códigos, upsert, bitácora)
// vive en lib/inventario/import.ts, igual que en la carga manual.
//
// Seguridad: si CRON_SECRET está configurado en Vercel, exige el header
// Authorization: Bearer <CRON_SECRET> (Vercel lo inyecta automáticamente).
//
// Parámetros de prueba: ?dryRun=1 (no escribe) y ?dias=N (ventana, default 5).

import { NextResponse } from "next/server";
import { listInventarioFiles, downloadDriveFile } from "@/lib/inventario/drive";
import { importInventarioFile } from "@/lib/inventario/import";
import {
  looksLikeInventarioFile,
  warehouseFromFilename,
} from "@/lib/inventario/warehouse-from-filename";
import type { Warehouse } from "@/lib/warehouses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Carpeta "My Mac/Downloads" del Drive de Sabrina, donde caen los .xls que baja
// de CONTPAQ. Se puede apuntar a otra con INVENTARIO_DRIVE_FOLDER_ID.
const DEFAULT_FOLDER_ID = "14Hy4N8Zv6bRE3nnKrsfgwtNabzLXpYS3";
const DEFAULT_DIAS = 5;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const params = new URL(req.url).searchParams;
  const dryRun = params.get("dryRun") === "1";
  const dias = Number(params.get("dias")) || DEFAULT_DIAS;
  const folderId = process.env.INVENTARIO_DRIVE_FOLDER_ID || DEFAULT_FOLDER_ID;

  let archivos;
  try {
    archivos = await listInventarioFiles({ folderId, sinceDays: dias });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }

  // Solo hojas de cálculo de un almacén reconocible y, de cada bodega, la más
  // reciente (Drive ya los devuelve del más nuevo al más viejo).
  const elegidos = new Map<Warehouse, (typeof archivos)[number]>();
  const ignorados: string[] = [];
  for (const f of archivos) {
    if (!looksLikeInventarioFile(f.name)) {
      ignorados.push(f.name);
      continue;
    }
    const warehouse = warehouseFromFilename(f.name)!;
    if (!elegidos.has(warehouse)) elegidos.set(warehouse, f);
  }

  const resultados: Record<string, unknown>[] = [];
  for (const [warehouse, file] of elegidos) {
    try {
      const buffer = await downloadDriveFile(file.id);
      const { httpStatus, ...res } = await importInventarioFile({
        fileName: file.name,
        buffer,
        warehouse,
        fileDate: file.modifiedTime,
        dryRun,
      });
      resultados.push(res);
    } catch (e) {
      resultados.push({
        ok: false,
        warehouse,
        fileName: file.name,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  const cargados = resultados.filter((r) => r.ok && !r.skipped).length;
  const sinCambio = resultados.filter((r) => r.skipped).length;
  const conError = resultados.filter((r) => !r.ok).length;

  return NextResponse.json({
    ok: conError === 0,
    dryRun: dryRun || undefined,
    ventanaDias: dias,
    archivosEnDrive: archivos.length,
    bodegas: elegidos.size,
    cargados,
    sinCambio,
    conError,
    resultados,
    ignorados: ignorados.slice(0, 10),
  });
}
