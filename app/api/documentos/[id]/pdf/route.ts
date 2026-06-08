// GET /api/documentos/[id]/pdf — descarga en PDF un documento generado en
// Teravino Docs, con el membrete TERAVINO.

import { renderToBuffer } from "@react-pdf/renderer";
import { getCurrentRep } from "@/lib/auth";
import { base44Docs, type Base44GeneratedDoc } from "@/lib/base44-docs";
import { DocumentoPdf } from "@/components/documentos/DocumentoPdf";

// Extrae el folio TD-... del contenido si existe, para mostrarlo en el encabezado.
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

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const rep = await getCurrentRep();
  if (!rep) return new Response("No autenticado", { status: 401 });

  let doc: Base44GeneratedDoc;
  try {
    doc = await base44Docs.entity<Base44GeneratedDoc>("GeneratedDocument").get(params.id);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    const status = msg.includes("BASE44_DOCS") ? 503 : 404;
    return new Response(status === 503 ? msg : "Documento no encontrado", { status });
  }

  // Cada quien ve los suyos: un vendedor no descarga el PDF de un documento ajeno.
  if (rep.role !== "admin" && doc.crm_rep_email !== rep.email) {
    return new Response("Documento no encontrado", { status: 404 });
  }

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

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${slug(doc.title) || "documento"}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
