import { NextResponse } from "next/server";
import { getCurrentRep } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { downloadDriveFile, latestDriveFileInFolder } from "@/lib/google-drive";
import { parseVentasContpaq } from "@/lib/excel/parseVentas";
import { importContpaqSales, summaryAlert, summaryWarnings } from "@/lib/ventas/import-contpaq";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SALES_FOLDER_ID = process.env.GOOGLE_DRIVE_SALES_FOLDER_ID || "14Hy4N8Zv6bRE3nnKrsfgwtNabzLXpYS3";

// Sincroniza el reporte de ventas más reciente de Drive. Corre por el mismo
// RPC que la pantalla /ventas/importar: nunca descarta clientes en silencio y
// cuadra contra el "Total General".
export async function POST() {
  const rep = await getCurrentRep();
  if (!rep || rep.role !== "admin") return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  try {
    const file = await latestDriveFileInFolder({ folderId: SALES_FOLDER_ID, nameContains: "ventas" });
    const bytes = await downloadDriveFile(file.id);
    const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const parsed = await parseVentasContpaq(arrayBuffer);
    if (!parsed.periodGuess || !parsed.clientes.length) {
      return NextResponse.json({ error: "El archivo mas reciente no contiene ventas CONTPAQ validas" }, { status: 422 });
    }

    const summary = await importContpaqSales(supabaseAdmin(), {
      period: parsed.periodGuess,
      clientes: parsed.clientes,
      totalGeneral: parsed.totalGeneral,
      parseErrors: parsed.errors.length,
      sourceFileName: file.name,
      replacePeriod: true,
    });
    const alert = summaryAlert(summary);
    const warnings = summaryWarnings(summary);

    return NextResponse.json({
      ok: true,
      fileName: file.name,
      fileModifiedAt: file.modifiedTime,
      period: parsed.periodGuess,
      customers: summary.customers,
      productLines: summary.product_lines,
      created: summary.created.length,
      errors: summary.skipped.length + parsed.errors.length,
      warnings,
      alert,
      totalDiff: summary.total_diff,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudieron actualizar las ventas" }, { status: 500 });
  }
}
