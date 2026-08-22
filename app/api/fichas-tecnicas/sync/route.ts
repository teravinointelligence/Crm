import { NextResponse } from "next/server";
import { getCurrentRep } from "@/lib/auth";
import { listDriveTechnicalSheets } from "@/lib/google-drive";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  autoMatchDriveFile,
  saveTechnicalSheetSyncError,
  syncDriveFileToProduct,
  TECHNICAL_SHEET_PRODUCT_FIELDS,
  type TechnicalSheetProduct,
} from "@/lib/technical-sheet-library";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SyncBody = { driveFileId?: string; productId?: string };

async function requireAdmin() {
  const rep = await getCurrentRep();
  if (!rep) {
    return { rep: null, response: NextResponse.json({ error: "No autenticado" }, { status: 401 }) };
  }
  if (rep.role !== "admin") {
    return { rep, response: NextResponse.json({ error: "Solo admin" }, { status: 403 }) };
  }
  return { rep, response: null };
}

export async function POST(request: Request) {
  const { rep, response } = await requireAdmin();
  if (response || !rep) return response;

  let body: SyncBody = {};
  try {
    body = (await request.json()) as SyncBody;
  } catch {
    body = {};
  }
  if (Boolean(body.driveFileId) !== Boolean(body.productId)) {
    return NextResponse.json(
      { error: "Para vincular una ficha se requieren el archivo y el producto" },
      { status: 400 },
    );
  }

  const db = supabaseAdmin();
  const [{ data: rawProducts, error: productsError }, drive] = await Promise.all([
    db.from("products").select(TECHNICAL_SHEET_PRODUCT_FIELDS).order("supplier").order("name"),
    listDriveTechnicalSheets(),
  ]);
  if (productsError) {
    return NextResponse.json({ error: productsError.message }, { status: 500 });
  }
  const products = (rawProducts ?? []) as TechnicalSheetProduct[];

  if (body.driveFileId && body.productId) {
    const file = drive.files.find((item) => item.id === body.driveFileId);
    const product = products.find((item) => item.id === body.productId);
    if (!file) return NextResponse.json({ error: "El PDF ya no está en Drive" }, { status: 404 });
    if (!product) return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });

    const { error: releaseError } = await db
      .from("products")
      .update({
        technical_sheet_drive_file_id: null,
        technical_sheet_drive_file_name: null,
        technical_sheet_drive_url: null,
        technical_sheet_drive_modified_at: null,
        technical_sheet_drive_md5: null,
        technical_sheet_drive_synced_at: null,
        technical_sheet_drive_sync_error: null,
      })
      .eq("technical_sheet_drive_file_id", file.id)
      .neq("id", product.id);
    if (releaseError) {
      return NextResponse.json({ error: releaseError.message }, { status: 500 });
    }

    try {
      const result = await syncDriveFileToProduct({ file, product, repId: rep.id });
      return NextResponse.json({
        ok: true,
        linked: true,
        uploaded: result.uploaded,
        folderUrl: drive.folder.url,
      });
    } catch (error) {
      const message = await saveTechnicalSheetSyncError(product.id, error);
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  const linkedByFile = new Map(
    products
      .filter((product) => product.technical_sheet_drive_file_id)
      .map((product) => [product.technical_sheet_drive_file_id as string, product]),
  );
  const claimedProducts = new Set(
    products
      .filter((product) => product.technical_sheet_drive_file_id)
      .map((product) => product.id),
  );
  let synced = 0;
  let unchanged = 0;
  const errors: Array<{ file: string; error: string }> = [];
  const unmatched: Array<{ id: string; name: string }> = [];

  for (const file of drive.files) {
    let product = linkedByFile.get(file.id) ?? null;
    if (!product) {
      product = autoMatchDriveFile(
        file,
        products.filter((candidate) => !claimedProducts.has(candidate.id)),
      );
    }
    if (!product) {
      unmatched.push({ id: file.id, name: file.name });
      continue;
    }
    claimedProducts.add(product.id);
    try {
      const result = await syncDriveFileToProduct({ file, product, repId: rep.id });
      if (result.uploaded) synced += 1;
      else unchanged += 1;
    } catch (error) {
      const message = await saveTechnicalSheetSyncError(product.id, error);
      errors.push({ file: file.name, error: message });
    }
  }

  const driveFileIds = new Set(drive.files.map((file) => file.id));
  const missing = products.filter(
    (product) =>
      product.technical_sheet_drive_file_id &&
      !driveFileIds.has(product.technical_sheet_drive_file_id),
  );
  for (const product of missing) {
    await saveTechnicalSheetSyncError(product.id, "El PDF vinculado ya no está en Google Drive");
  }

  return NextResponse.json({
    ok: true,
    synced,
    unchanged,
    unmatched,
    missing: missing.length,
    errors,
    folderUrl: drive.folder.url,
  });
}
