import { redirect } from "next/navigation";
import { getCurrentRep } from "@/lib/auth";
import { listDriveTechnicalSheets, type DriveTechnicalSheet } from "@/lib/google-drive";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  TECHNICAL_SHEET_PRODUCT_FIELDS,
  type TechnicalSheetProduct,
} from "@/lib/technical-sheet-library";
import { TechnicalSheetsLibrary } from "@/components/products/TechnicalSheetsLibrary";

export const metadata = { title: "Fichas técnicas — TERAVINO CRM" };
export const dynamic = "force-dynamic";

export default async function TechnicalSheetsPage() {
  const rep = await getCurrentRep();
  if (!rep) redirect("/login");
  if (rep.role !== "admin") redirect("/catalogo");

  const db = supabaseAdmin();
  const productsPromise = db
    .from("products")
    .select(TECHNICAL_SHEET_PRODUCT_FIELDS)
    .order("supplier")
    .order("name");
  const drivePromise = listDriveTechnicalSheets()
    .then((drive) => ({ drive, error: null as string | null }))
    .catch((error: unknown) => ({
      drive: null,
      error: error instanceof Error ? error.message : "No se pudo consultar Google Drive",
    }));
  const [{ data, error }, driveResult] = await Promise.all([productsPromise, drivePromise]);
  if (error) throw new Error(error.message);

  const driveFiles: DriveTechnicalSheet[] = driveResult.drive?.files ?? [];
  const driveFolder = driveResult.drive?.folder ?? null;
  const driveError = driveResult.error;

  return (
    <TechnicalSheetsLibrary
      products={(data ?? []) as TechnicalSheetProduct[]}
      driveFiles={driveFiles}
      driveFolder={driveFolder}
      driveError={driveError}
    />
  );
}
