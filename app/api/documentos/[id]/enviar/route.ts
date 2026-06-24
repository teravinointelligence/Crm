// POST /api/documentos/[id]/enviar
// Genera el PDF del documento y lo manda por correo a los contactos de la cuenta,
// luego marca el documento como "enviado" en Base44.

import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { getCurrentRep } from "@/lib/auth";
import { canAccessFacturacion } from "@/lib/modules";
import { createClient } from "@/lib/supabase/server";
import { base44Docs, type Base44GeneratedDoc } from "@/lib/base44-docs";
import { DocumentoPdf } from "@/components/documentos/DocumentoPdf";
import { sendEmail } from "@/lib/email";
import { logClientEmail } from "@/lib/email-log";

function extractNumero(content: string): string | null {
  const m = content.match(/TD-\d{8}-\d{3,5}/);
  return m ? m[0] : null;
}

function slug(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 60);
}

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const rep = await getCurrentRep();
  if (!rep) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  // Obtener documento de Base44
  let doc: Base44GeneratedDoc;
  try {
    doc = await base44Docs.entity<Base44GeneratedDoc>("GeneratedDocument").get(params.id);
  } catch {
    return NextResponse.json({ error: "Documento no encontrado" }, { status: 404 });
  }

  const isAdmin = canAccessFacturacion(rep.role);
  if (!isAdmin && doc.crm_rep_email !== rep.email) {
    return NextResponse.json({ error: "No tienes permiso" }, { status: 403 });
  }

  // Buscar contactos de la cuenta en el CRM
  const supabase = createClient();
  const accountId = doc.client_id;

  const { data: contacts } = await supabase
    .from("contacts")
    .select("full_name, email")
    .eq("account_id", accountId)
    .not("email", "is", null)
    .neq("email", "")
    .limit(20);

  const emails = ((contacts ?? []) as { full_name: string | null; email: string | null }[])
    .map((c) => c.email as string)
    .filter(Boolean);

  if (emails.length === 0) {
    return NextResponse.json(
      { error: "Esta cuenta no tiene contactos con correo registrado." },
      { status: 422 },
    );
  }

  // Generar PDF
  const buffer = await renderToBuffer(
    DocumentoPdf({
      data: {
        title: doc.title,
        numero: extractNumero(doc.content),
        clientName: doc.client_name ?? null,
        templateName: doc.template_name ?? null,
        content: doc.content,
      },
    }),
  );

  const base64 = Buffer.from(buffer).toString("base64");
  const filename = `${slug(doc.title) || "documento"}.pdf`;

  // Enviar correo
  const subject = `${doc.title}${doc.client_name ? ` — ${doc.client_name}` : ""}`;
  let resendId: string | null = null;
  try {
    const result = await sendEmail({
      to: emails,
      subject,
      html: `<p>Estimado cliente,</p>
<p>Adjuntamos el documento <strong>${doc.title}</strong> de parte de <strong>TERAVINO</strong>.</p>
<p>Cualquier duda, no dudes en contactarnos.</p>
<p>Saludos,<br/>${rep.full_name}<br/>TERAVINO</p>`,
      attachments: [
        {
          filename,
          content: base64,
        },
      ],
    });
    resendId = result.id;
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error al enviar correo" },
      { status: 502 },
    );
  }

  // Marcar como enviado en Base44
  try {
    await base44Docs
      .entity<Base44GeneratedDoc>("GeneratedDocument")
      .update(params.id, { status: "enviado" });
  } catch {
    // best-effort: no rollback del correo ya enviado
  }

  // Bitácora
  await logClientEmail(supabase, {
    accountId,
    kind: "otro",
    subject,
    recipients: emails,
    refTable: "base44_docs",
    refId: params.id,
    resendId,
    sentBy: rep.full_name,
  });

  return NextResponse.json({ ok: true, recipients: emails.length });
}
