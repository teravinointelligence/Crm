import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  downloadDriveTechnicalSheet,
  type DriveTechnicalSheet,
} from "@/lib/google-drive";
import { autoMatchDriveFile, normalizeTechnicalSheetKey } from "@/lib/technical-sheet-match.mjs";

export { autoMatchDriveFile, normalizeTechnicalSheetKey };

const BUCKET = "fichas-tecnicas";
const MAX_BYTES = 15 * 1024 * 1024;

export type TechnicalSheetProduct = {
  id: string;
  name: string;
  sku: string | null;
  supplier: string;
  vintage: string | null;
  active: boolean | null;
  technical_sheet_path: string | null;
  technical_sheet_file_name: string | null;
  technical_sheet_updated_at: string | null;
  technical_sheet_drive_file_id: string | null;
  technical_sheet_drive_file_name: string | null;
  technical_sheet_drive_url: string | null;
  technical_sheet_drive_modified_at: string | null;
  technical_sheet_drive_md5: string | null;
  technical_sheet_drive_synced_at: string | null;
  technical_sheet_drive_sync_error: string | null;
};

export const TECHNICAL_SHEET_PRODUCT_FIELDS =
  "id,name,sku,supplier,vintage,active,technical_sheet_path,technical_sheet_file_name,technical_sheet_updated_at,technical_sheet_drive_file_id,technical_sheet_drive_file_name,technical_sheet_drive_url,technical_sheet_drive_modified_at,technical_sheet_drive_md5,technical_sheet_drive_synced_at,technical_sheet_drive_sync_error";

function safeFileName(value: string) {
  const cleaned = value.replace(/[\r\n"\\/]/g, "_").trim();
  return cleaned || "ficha-tecnica.pdf";
}

export async function syncDriveFileToProduct(input: {
  file: DriveTechnicalSheet;
  product: TechnicalSheetProduct;
  repId: string;
}) {
  const db = supabaseAdmin();
  const now = new Date().toISOString();
  const driveMetadata = {
    technical_sheet_drive_file_id: input.file.id,
    technical_sheet_drive_file_name: input.file.name,
    technical_sheet_drive_url: input.file.webViewLink,
    technical_sheet_drive_modified_at: input.file.modifiedTime,
    technical_sheet_drive_md5: input.file.md5Checksum,
    technical_sheet_drive_synced_at: now,
    technical_sheet_drive_sync_error: null,
  };

  if (
    input.product.technical_sheet_path &&
    input.file.md5Checksum &&
    input.product.technical_sheet_drive_md5 === input.file.md5Checksum
  ) {
    const { error } = await db.from("products").update(driveMetadata).eq("id", input.product.id);
    if (error) throw new Error(error.message);
    return { uploaded: false };
  }

  if (input.file.size && input.file.size > MAX_BYTES) {
    throw new Error("El PDF supera 15 MB");
  }
  const buffer = await downloadDriveTechnicalSheet(input.file.id);
  if (buffer.byteLength === 0 || buffer.byteLength > MAX_BYTES) {
    throw new Error(buffer.byteLength > MAX_BYTES ? "El PDF supera 15 MB" : "El PDF está vacío");
  }
  if (buffer.subarray(0, 5).toString("ascii") !== "%PDF-") {
    throw new Error("El archivo de Drive no contiene un PDF válido");
  }

  const storage = db.storage.from(BUCKET);
  const path = `${input.product.id}/drive-${Date.now()}.pdf`;
  const { error: uploadError } = await storage.upload(path, buffer, {
    contentType: "application/pdf",
    upsert: false,
  });
  if (uploadError) throw new Error(`No se pudo copiar el PDF: ${uploadError.message}`);

  const { error: updateError } = await db
    .from("products")
    .update({
      ...driveMetadata,
      technical_sheet_path: path,
      technical_sheet_file_name: safeFileName(input.file.name),
      technical_sheet_updated_at: now,
      technical_sheet_updated_by: input.repId,
    })
    .eq("id", input.product.id);
  if (updateError) {
    await storage.remove([path]);
    throw new Error(updateError.message);
  }

  if (input.product.technical_sheet_path && input.product.technical_sheet_path !== path) {
    await storage.remove([input.product.technical_sheet_path]);
  }
  return { uploaded: true };
}

export async function saveTechnicalSheetSyncError(productId: string, error: unknown) {
  const message = error instanceof Error ? error.message : "No se pudo sincronizar la ficha";
  await supabaseAdmin()
    .from("products")
    .update({ technical_sheet_drive_sync_error: message.slice(0, 500) })
    .eq("id", productId);
  return message;
}
