import { NextResponse } from "next/server";
import { getCurrentRep } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { downloadDriveFile, latestDriveFileInFolder } from "@/lib/google-drive";
import { parseVentasContpaq } from "@/lib/excel/parseVentas";
import { normalizeClientNumber } from "@/lib/excel/parseCartera";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SALES_FOLDER_ID = process.env.GOOGLE_DRIVE_SALES_FOLDER_ID || "14Hy4N8Zv6bRE3nnKrsfgwtNabzLXpYS3";

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

    const supabase = supabaseAdmin();
    const { data: accounts, error: accountError } = await supabase
      .from("accounts")
      .select("id, client_number, business_name, assigned_rep_id")
      .range(0, 49_999);
    if (accountError) throw accountError;

    const byClientNumber = new Map<string, { id: string; assignedRepId: string | null; name: string }>();
    for (const account of accounts ?? []) {
      const clientNumber = normalizeClientNumber(account.client_number);
      if (clientNumber) byClientNumber.set(clientNumber, { id: account.id, assignedRepId: account.assigned_rep_id, name: account.business_name });
    }

    const errors: string[] = [];
    const matched = parsed.clientes.flatMap((customer) => {
      const account = customer.client_number ? byClientNumber.get(customer.client_number) : undefined;
      if (!account) {
        errors.push(`# ${customer.client_number ?? "?"} (${customer.client_name ?? "?"}): cliente no existe en CRM`);
        return [];
      }
      if (!account.assignedRepId) {
        errors.push(`# ${customer.client_number} (${account.name}): cuenta sin vendedor asignado`);
        return [];
      }
      return [{ account, customer }];
    });
    if (!matched.length) return NextResponse.json({ error: "Ningun cliente del reporte pudo asociarse al CRM", errors }, { status: 422 });

    const salesPayload = matched.map(({ account, customer }) => ({
      account_id: account.id,
      sales_rep_id: account.assignedRepId,
      period: parsed.periodGuess,
      client_number: customer.client_number,
      client_name: customer.client_name,
      vendedor_excel: null,
      venta_bruta: customer.venta_bruta,
      neto: customer.neto,
      descuento: customer.descuento,
      neto_desc: customer.neto_desc,
    }));
    const { data: sales, error: salesError } = await supabase
      .from("monthly_sales")
      .upsert(salesPayload, { onConflict: "account_id,period" })
      .select("id, account_id");
    if (salesError || !sales) throw salesError || new Error("No se devolvieron las ventas actualizadas");

    const saleIdByAccount = new Map(sales.map((sale) => [sale.account_id as string, sale.id as string]));
    const items = matched.flatMap(({ account, customer }) => {
      const saleId = saleIdByAccount.get(account.id);
      if (!saleId) return [];
      return customer.items.map((item) => ({
        monthly_sale_id: saleId,
        codigo: item.codigo,
        producto_nombre: item.producto_nombre,
        cantidad: item.cantidad,
        neto: item.neto,
        descuento: item.descuento,
        neto_desc: item.neto_desc,
        impuesto: item.impuesto,
        total: item.total,
      }));
    });
    const { error: itemsError } = await supabase.rpc("replace_sales_items", {
      p_sale_ids: sales.map((sale) => sale.id),
      p_items: items,
    });
    if (itemsError) throw itemsError;

    const { error: logError } = await supabase.from("sales_imports").insert({
      period: parsed.periodGuess,
      source_file_name: file.name,
      source_format: "contpaq",
      customers_imported: matched.length,
      product_lines_imported: items.length,
      rows_error: errors.length + parsed.errors.length,
    });
    if (logError) throw logError;

    return NextResponse.json({
      ok: true,
      fileName: file.name,
      fileModifiedAt: file.modifiedTime,
      period: parsed.periodGuess,
      customers: matched.length,
      productLines: items.length,
      errors: errors.length + parsed.errors.length,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudieron actualizar las ventas" }, { status: 500 });
  }
}
