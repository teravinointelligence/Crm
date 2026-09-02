import "server-only";

import { sendEmail, ventasFrom } from "@/lib/email";
import { googleDriveConfigured, shareDriveFileWithUser, uploadDriveArchive } from "@/lib/google-drive";
import { buildSampleTechnicalSheetsArchive } from "@/lib/sample-technical-sheets";
import { supabaseAdmin } from "@/lib/supabase/admin";

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return entities[character];
  });
}

async function saveError(sampleId: string, error: string) {
  await supabaseAdmin()
    .from("sample_requests")
    .update({ technical_sheets_drive_error: error.slice(0, 1000) })
    .eq("id", sampleId);
}

export async function deliverSampleTechnicalSheets(sampleId: string): Promise<{
  ok: boolean;
  url?: string;
  error?: string;
}> {
  const db = supabaseAdmin();
  const { data: request } = await db
    .from("sample_requests")
    .select(
      "request_number, technical_sheets_drive_file_id, technical_sheets_drive_url, sales_reps:sales_rep_id(full_name, email), accounts:account_id(business_name)",
    )
    .eq("id", sampleId)
    .maybeSingle();
  if (!request) return { ok: false, error: "Muestra no encontrada" };

  const rep = (Array.isArray(request.sales_reps) ? request.sales_reps[0] : request.sales_reps) as
    | { full_name: string | null; email: string | null }
    | null;
  const account = (Array.isArray(request.accounts) ? request.accounts[0] : request.accounts) as
    | { business_name: string | null }
    | null;
  if (!rep?.email) {
    const error = "El vendedor no tiene correo registrado";
    await saveError(sampleId, error);
    return { ok: false, error };
  }
  if (!googleDriveConfigured()) {
    const error = "Google Drive aún no está autorizado en Vercel";
    await saveError(sampleId, error);
    return { ok: false, error };
  }

  try {
    let fileId = request.technical_sheets_drive_file_id as string | null;
    let url = request.technical_sheets_drive_url as string | null;
    let pending: string[] = [];
    let sheetCount: number | null = null;

    if (!fileId || !url) {
      const archive = await buildSampleTechnicalSheetsArchive(sampleId);
      if (!archive.ok) {
        await saveError(sampleId, archive.error);
        return { ok: false, error: archive.error };
      }
      const uploaded = await uploadDriveArchive({ name: archive.fileName, content: archive.buffer });
      fileId = uploaded.id;
      url = uploaded.url;
      pending = archive.pending;
      sheetCount = archive.sheetCount;
      const { error: updateError } = await db
        .from("sample_requests")
        .update({
          technical_sheets_drive_file_id: fileId,
          technical_sheets_drive_url: url,
          technical_sheets_drive_created_at: new Date().toISOString(),
          technical_sheets_drive_error: null,
        })
        .eq("id", sampleId);
      if (updateError) throw updateError;
    }

    await shareDriveFileWithUser(fileId, rep.email);
    const requestNumber = String(request.request_number || "Muestra");
    const safeNumber = escapeHtml(requestNumber);
    const safeName = escapeHtml(rep.full_name || "equipo");
    const safeAccount = account?.business_name ? escapeHtml(account.business_name) : null;
    const safeUrl = escapeHtml(url);
    await sendEmail({
      to: rep.email,
      from: ventasFrom(),
      subject: `${requestNumber} aprobada — fichas técnicas`,
      html: `
        <div style="font-family:Arial,Helvetica,sans-serif;max-width:620px;margin:0 auto;color:#222;">
          <h2 style="color:#7a1220;margin:0 0 8px;">Tus muestras fueron aprobadas</h2>
          <p>Hola ${safeName},</p>
          <p>La solicitud <strong>${safeNumber}</strong>${safeAccount ? ` para <strong>${safeAccount}</strong>` : ""} ya fue aprobada.</p>
          <p>Preparamos en Google Drive un paquete con las fichas técnicas disponibles para los vinos de esta muestra.</p>
          <p style="margin:24px 0;">
            <a href="${safeUrl}" style="display:inline-block;background:#7a1220;color:#fff;text-decoration:none;padding:11px 18px;border-radius:6px;font-weight:bold;">
              Descargar fichas técnicas
            </a>
          </p>
          ${sheetCount != null ? `<p style="font-size:13px;color:#666;">Incluye ${sheetCount} ficha(s) técnica(s).</p>` : ""}
          ${pending.length ? `<p style="font-size:13px;color:#8a5b00;">Faltan por cargar: ${pending.map(escapeHtml).join(", ")}.</p>` : ""}
          <p style="font-size:13px;color:#666;margin-top:24px;">El enlace está compartido únicamente con tu correo.</p>
        </div>`,
    });
    await db
      .from("sample_requests")
      .update({
        technical_sheets_drive_sent_at: new Date().toISOString(),
        technical_sheets_drive_error: null,
      })
      .eq("id", sampleId);
    return { ok: true, url };
  } catch (caught) {
    const error = caught instanceof Error ? caught.message : "No se pudo preparar el enlace de Google Drive";
    await saveError(sampleId, error);
    return { ok: false, error };
  }
}
